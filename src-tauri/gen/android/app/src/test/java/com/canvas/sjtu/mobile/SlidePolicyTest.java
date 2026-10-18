package com.canvas.sjtu.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class SlidePolicyTest {
    @Test public void acceptsOnlyOfficialHttpsImages(){assertTrue(SlidePolicy.allowed("https://v.sjtu.edu.cn/images/中文.jpg?token=sample"));assertTrue(SlidePolicy.allowed("https://course.sjtu.edu.cn:443/a.png"));for(String value:new String[]{"http://v.sjtu.edu.cn/a","https://v.sjtu.edu.cn.evil.test/a","https://evil-sjtu.edu.cn/a","https://user@v.sjtu.edu.cn/a","https://v.sjtu.edu.cn:444/a","file:///a","data:image/png;base64,a","https://127.0.0.1/a"})assertFalse(value,SlidePolicy.allowed(value));}
}
