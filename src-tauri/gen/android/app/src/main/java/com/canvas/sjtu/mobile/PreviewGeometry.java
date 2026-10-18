package com.canvas.sjtu.mobile;

/** Pixel-independent limits shared by native preview gestures and regression tests. */
public final class PreviewGeometry {
    private PreviewGeometry() {}
    public static float zoom(float value) { return Float.isFinite(value) ? Math.max(.25f, Math.min(6f, value)) : 1f; }
    public static float pan(float value, float extent, float scale) {
        if (!Float.isFinite(value) || !Float.isFinite(extent) || extent <= 0) return 0;
        float limit = Math.max(extent*.2f,Math.abs(extent * (zoom(scale)-1f))/2f);
        return Math.max(-limit, Math.min(limit, value));
    }
    public static float ratio(float value) { return Float.isFinite(value) ? Math.max(.3f, Math.min(.7f, value)) : .55f; }
    public static float[] box(float x,float y,float w,float h,float width,float height,float density) {
        width=Math.max(1,width);height=Math.max(1,height);
        w=Float.isFinite(w)?w:.38f;h=Float.isFinite(h)?h:.55f;
        w=Math.max(Math.min(180*density/width,.7f),Math.min(.9f,w));
        h=Math.max(Math.min(140*density/height,.8f),Math.min(.95f,h));
        x=Float.isFinite(x)?Math.max(0,Math.min(1-w,x)):1-w;
        y=Float.isFinite(y)?Math.max(0,Math.min(1-h,y)):0;
        return new float[]{x,y,w,h};
    }
}
