package com.canvas.sjtu.mobile;

import java.io.*;
import java.util.*;
import java.util.zip.*;

/** Index a presentation without inflating its pictures, recordings or OLE attachments. */
public final class PptxArchive {
    private PptxArchive() {}
    public static final class Part {
        public final String name; public final long size;
        Part(String name,long size){this.name=name;this.size=size;}
    }
    public static final class Structure {
        public final byte[] zip; public final List<Part> images;
        Structure(byte[] zip,List<Part> images){this.zip=zip;this.images=images;}
    }
    public static boolean imagePart(String name){
        if(name==null||!name.startsWith("ppt/media/")||name.indexOf('\\')>=0||name.contains("../")||name.contains("/./"))return false;
        for(int i=0;i<name.length();i++)if(Character.isISOControl(name.charAt(i)))return false;
        return name.toLowerCase(Locale.ROOT).matches("ppt/media/[^/]+\\.(png|jpe?g|gif|webp|bmp|tiff?|svg|emf|wmf)");
    }
    public static byte[] readBounded(InputStream input,int limit)throws IOException{
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[16384];int read,total=0;
        while((read=input.read(buffer))!=-1){total+=read;if(total>limit)throw new IOException("Presentation part exceeds the working-memory budget");out.write(buffer,0,read);}return out.toByteArray();
    }
    /** Forward already display-sized rasters without a decode/compress round trip. */
    public static boolean directImage(long bytes,int width,int height,String mime){
        return bytes>0&&bytes<=8L*1024*1024&&width>0&&height>0&&width<=3072&&height<=3072
            &&(long)width*height<=6_000_000L
            &&("image/jpeg".equals(mime)||"image/png".equals(mime)||"image/webp".equals(mime));
    }
    public static Structure structure(File file)throws IOException{
        List<Part> images=new ArrayList<>();Set<String> names=new HashSet<>();ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        int xmlBytes=0,fontBytes=0;boolean presentation=false,types=false;
        try(ZipFile zip=new ZipFile(file);ZipOutputStream result=new ZipOutputStream(bytes)){
            // This is an IPC envelope, not a stored archive: spend less CPU re-compressing XML.
            result.setLevel(Deflater.BEST_SPEED);
            if(zip.size()>20000)throw new IOException("Too many presentation parts");
            Enumeration<? extends ZipEntry> entries=zip.entries();
            while(entries.hasMoreElements()){
                ZipEntry entry=entries.nextElement();String name=entry.getName();if(entry.isDirectory())continue;
                if(!names.add(name))throw new IOException("Duplicate presentation part");
                if(imagePart(name)){images.add(new Part(name,entry.getSize()));continue;}
                boolean xml=name.equals("[Content_Types].xml")||(name.startsWith("ppt/")&&!name.startsWith("ppt/embeddings/")&&(name.endsWith(".xml")||name.endsWith(".rels")));
                boolean font=name.matches("ppt/fonts/[^/]+\\.fntdata");if(!xml&&!font)continue;
                if(name.contains("../")||name.indexOf('\\')>=0)throw new IOException("Invalid part name");
                int remaining=xml?32*1024*1024-xmlBytes:16*1024*1024-fontBytes;
                int limit=Math.min(8*1024*1024,remaining);if(limit<=0||entry.getSize()>limit)throw new IOException("Presentation structure is too complex");
                byte[] data;try(InputStream input=zip.getInputStream(entry)){data=readBounded(input,limit);}
                if(xml)xmlBytes+=data.length;else fontBytes+=data.length;
                result.putNextEntry(new ZipEntry(name));result.write(data);result.closeEntry();
                if(name.equals("ppt/presentation.xml"))presentation=true;if(name.equals("[Content_Types].xml"))types=true;
            }
        }
        if(!presentation||!types)throw new IOException("Not a PowerPoint presentation");
        return new Structure(bytes.toByteArray(),images);
    }
}
