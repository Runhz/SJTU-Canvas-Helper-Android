package com.canvas.sjtu.mobile;
import org.junit.Test;
import java.io.*;
import java.util.zip.*;
import static org.junit.Assert.*;

public class PptxArchiveTest {
    @Test public void displaySizedCompressedPicturesDoNotNeedReencoding(){
        assertTrue(PptxArchive.directImage(512000,1920,1080,"image/jpeg"));
        assertTrue(PptxArchive.directImage(8L*1024*1024,3000,2000,"image/png"));
        assertTrue(PptxArchive.directImage(1000,800,600,"image/webp"));
        assertFalse(PptxArchive.directImage(8L*1024*1024+1,1920,1080,"image/jpeg"));
        assertFalse(PptxArchive.directImage(1000,3072,3072,"image/png"));
        assertFalse(PptxArchive.directImage(1000,100000,100000,"image/jpeg"));
        assertFalse(PptxArchive.directImage(1000,-1,1080,"image/jpeg"));
        assertFalse(PptxArchive.directImage(1000,1920,1080,"image/gif"));
        assertFalse(PptxArchive.directImage(1000,1920,1080,null));
    }
    @Test public void aLargePresentationDoesNotCopyItsPicturesOrRecordingsIntoTheStructure()throws Exception{
        File file=File.createTempFile("large-presentation-",".pptx");
        try{
            try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(file))){
                text(zip,"[Content_Types].xml","<Types/>");text(zip,"ppt/presentation.xml","<presentation/>");text(zip,"ppt/slides/slide1.xml","<slide/>");
                // STORED data keeps the real archive over 64 MiB without a huge heap allocation.
                byte[] block=new byte[1024*1024];CRC32 crc=new CRC32();for(int i=0;i<66;i++)crc.update(block);
                ZipEntry picture=new ZipEntry("ppt/media/image1.png");picture.setMethod(ZipEntry.STORED);picture.setSize(66L*block.length);picture.setCompressedSize(picture.getSize());picture.setCrc(crc.getValue());zip.putNextEntry(picture);for(int i=0;i<66;i++)zip.write(block);zip.closeEntry();
                text(zip,"ppt/media/movie.mp4","unused video");text(zip,"ppt/embeddings/oleObject1.bin","unused object");
            }
            assertTrue(file.length()>64L*1024*1024);PptxArchive.Structure parts=PptxArchive.structure(file);
            assertTrue(parts.zip.length<4096);assertEquals(1,parts.images.size());assertEquals(66L*1024*1024,parts.images.get(0).size);
            try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(parts.zip))){ZipEntry e;while((e=zip.getNextEntry())!=null)assertFalse(e.getName().startsWith("ppt/media/"));}
        }finally{assertTrue(file.delete());}
    }
    @Test public void rejectsArbitraryAndParentTraversalMediaPaths(){
        for(String path:new String[]{"../secret.png","ppt/media/../../secret.png","file:///private.png","ppt/media/movie.mp4","ppt/media/x/other.png","ppt/media/a\\b.png"})assertFalse(path,PptxArchive.imagePart(path));
        assertTrue(PptxArchive.imagePart("ppt/media/中文图片 1.PNG"));
    }
    @Test public void boundsInflationIndependentlyOfTheWholeFileSize()throws Exception{
        try{PptxArchive.readBounded(new ByteArrayInputStream(new byte[1025]),1024);fail("Unbounded inflation");}catch(IOException expected){}
    }
    private static void text(ZipOutputStream zip,String path,String data)throws Exception{zip.putNextEntry(new ZipEntry(path));zip.write(data.getBytes("UTF-8"));zip.closeEntry();}
}
