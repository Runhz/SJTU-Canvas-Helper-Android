package com.canvas.sjtu.mobile;

import java.net.URI;
import java.util.Locale;

/** Pure bounds and origin rules shared by the Android reader and local tests. */
public final class DocumentPolicy {
    private DocumentPolicy() {}
    public static int chunkSize(long total, long offset, int length, long expected) {
        if(total<1 || total>64L*1024*1024 || offset<0 || offset>=total || length<1 || length>262144 || (expected>=0 && expected!=total)) throw new IllegalArgumentException("Invalid document read range");
        return (int)Math.min((long)length,total-offset);
    }
    public static boolean allowedUrl(String value, boolean entry) {
        try {
            URI uri = new URI(value);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return false;
            host = host.toLowerCase(Locale.ROOT);
            return host.equals("oc.sjtu.edu.cn") || (!entry && (host.equals("lms.sjtu.edu.cn") || host.equals("wps-xz.sjtu.edu.cn") || host.equals("instructure.com") || host.endsWith(".instructure.com") || host.endsWith(".canvas-user-content.com")));
        } catch (Exception e) { return false; }
    }
    public static int[] renderSize(int width, int height, int requested) {
        if (width <= 0 || height <= 0) throw new IllegalArgumentException("Invalid page size");
        double scale = Math.min(Math.max(320, Math.min(2048, requested)) / (double) width, 3072.0 / height);
        return new int[]{Math.max(1, (int) Math.round(width * scale)), Math.max(1, (int) Math.round(height * scale))};
    }
    public static boolean allowedNavigation(String value, boolean mainFrame) {
        if (!mainFrame && "about:blank".equals(value)) return true;
        if (!mainFrame && value.startsWith("blob:")) return allowedUrl(value.substring(5), false);
        return allowedUrl(value, false);
    }
}
