package com.canvas.sjtu.mobile;

import java.net.URI;
import java.util.Locale;

public final class SlidePolicy {
    private SlidePolicy() {}
    public static boolean allowed(String value) {
        try {
            URI uri=new URI(value);String host=uri.getHost();
            if(!"https".equalsIgnoreCase(uri.getScheme())||host==null||uri.getRawUserInfo()!=null||(uri.getPort()!=-1&&uri.getPort()!=443))return false;
            host=host.toLowerCase(Locale.ROOT);
            return host.equals("sjtu.edu.cn")||host.endsWith(".sjtu.edu.cn");
        }catch(Exception e){return false;}
    }
}
