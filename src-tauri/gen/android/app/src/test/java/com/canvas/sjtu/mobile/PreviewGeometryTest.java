package com.canvas.sjtu.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class PreviewGeometryTest {
    @Test public void zoomCanShrinkAndRecoversInvalidValues(){assertEquals(.25f,PreviewGeometry.zoom(.1f),0);assertEquals(.75f,PreviewGeometry.zoom(.75f),0);assertEquals(6f,PreviewGeometry.zoom(20),0);assertEquals(1f,PreviewGeometry.zoom(Float.NaN),0);}
    @Test public void shrunkenContentCanMoveWithinItsMargins(){assertEquals(70,PreviewGeometry.pan(70,400,.5f),0);assertEquals(100,PreviewGeometry.pan(900,400,.5f),0);assertEquals(-75,PreviewGeometry.pan(-900,300,.5f),0);assertEquals(0,PreviewGeometry.pan(Float.NaN,400,1),0);}
    @Test public void pipAlwaysFitsAfterRotationAndWindowResize(){for(float width:new float[]{320,600,1200})for(float height:new float[]{160,360,900}){float[] b=PreviewGeometry.box(2,-1,3,2,width,height,1);assertTrue(b[0]>=0&&b[1]>=0);assertTrue(b[0]+b[2]<=1.00001&&b[1]+b[3]<=1.00001);assertTrue(b[2]>0&&b[3]>0);}float[] invalid=PreviewGeometry.box(Float.NaN,Float.NaN,Float.NaN,Float.NaN,1,1,2);for(float v:invalid)assertTrue(Float.isFinite(v));}
    @Test public void parallelDividerKeepsBothSidesReadable(){assertEquals(.3f,PreviewGeometry.ratio(-2),0);assertEquals(.7f,PreviewGeometry.ratio(2),0);assertEquals(.55f,PreviewGeometry.ratio(Float.NaN),0);}
}
