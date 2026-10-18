package com.canvas.sjtu.mobile;
import org.junit.Test;
import static org.junit.Assert.*;

public class DocumentPolicyTest {
    @Test public void remotePreviewCannotNavigateToLocalOrLookalikeOrigins() {
        for (String url : new String[]{"http://oc.sjtu.edu.cn/a", "file:///data/private", "javascript:alert(1)", "https://oc.sjtu.edu.cn.evil.test/a", "https://evil-instructure.com/a", "https://oc.sjtu.edu.cn:8443/a", "https://user:password@oc.sjtu.edu.cn/a"}) assertFalse(url, DocumentPolicy.allowedUrl(url, false));
        assertTrue(DocumentPolicy.allowedUrl("https://oc.sjtu.edu.cn/login/session_token/test", true));
        assertTrue(DocumentPolicy.allowedUrl("https://canvadocs.instructure.com/document/1", false));
        assertFalse(DocumentPolicy.allowedUrl("https://canvadocs.instructure.com/document/1", true));
        assertTrue(DocumentPolicy.allowedUrl("https://lms.sjtu.edu.cn/wps/preview", false));
        assertTrue(DocumentPolicy.allowedUrl("https://wps-xz.sjtu.edu.cn/weboffice/office/p/document", false));
        assertFalse(DocumentPolicy.allowedUrl("https://wps-xz.sjtu.edu.cn/weboffice/office/p/document", true));
        assertFalse(DocumentPolicy.allowedUrl("https://wps-xz.sjtu.edu.cn.evil.test/", false));
        assertFalse(DocumentPolicy.allowedUrl("https://other.sjtu.edu.cn/", false));
    }
    @Test public void largeAndTallPagesStayInsideBitmapBudget() {
        for (int[] page : new int[][]{{600,800},{1,2000000000},{2000000000,1},{100000,100000}}) {
            int[] size = DocumentPolicy.renderSize(page[0], page[1], 100000);
            assertTrue(size[0] > 0 && size[0] <= 2048);
            assertTrue(size[1] > 0 && size[1] <= 3072);
            assertTrue((long)size[0]*size[1] <= 2048L*3072L);
        }
    }
    @Test public void isolatedSchoolFramesCanUseOwnBlobsWithoutNavigatingTheTopPageToThem() {
        assertTrue(DocumentPolicy.allowedNavigation("about:blank", false));
        assertTrue(DocumentPolicy.allowedNavigation("blob:https://wps-xz.sjtu.edu.cn/document-id", false));
        assertFalse(DocumentPolicy.allowedNavigation("about:blank", true));
        assertFalse(DocumentPolicy.allowedNavigation("blob:https://wps-xz.sjtu.edu.cn/document-id", true));
        assertFalse(DocumentPolicy.allowedNavigation("blob:https://wps-xz.sjtu.edu.cn.evil.test/id", false));
        assertFalse(DocumentPolicy.allowedNavigation("blob:null/id", false));
        assertFalse(DocumentPolicy.allowedNavigation("file:///data/private", false));
    }
    @Test(expected=IllegalArgumentException.class) public void rejectsInvalidPageDimensions() { DocumentPolicy.renderSize(0, 100, 1200); }
    @Test public void readsOnlyBoundedChunksOfAnUnchangedDocument() {
        assertEquals(7,DocumentPolicy.chunkSize(10,3,262144,10));
        for(long[] invalid:new long[][]{{0,0,1,-1},{10,-1,1,-1},{10,10,1,-1},{10,0,262145,-1},{10,0,0,-1},{10,0,1,11},{64L*1024*1024+1,0,1,-1}}){
            try{DocumentPolicy.chunkSize(invalid[0],invalid[1],(int)invalid[2],invalid[3]);fail("Out-of-range read allowed");}catch(IllegalArgumentException expected){}
        }
    }
}
