import {describe,it,expect,vi} from 'vitest';
import {drawMarks} from './ImageCropper';
describe('image annotation export coordinates',()=>{
  it('exports a continuous freehand stroke registered to the cropped source coordinates',()=>{
    const ctx={beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn()} as unknown as CanvasRenderingContext2D;
    drawMarks(ctx,400,400,[{mode:'pen',x:.1,y:.2,endX:.5,endY:.6,points:[{x:.1,y:.2},{x:.3,y:.4},{x:.5,y:.6}]}],{x:.1,y:.2,w:.4,h:.4});expect(ctx.moveTo).toHaveBeenCalledWith(0,0);expect(vi.mocked(ctx.lineTo).mock.calls[0][0]).toBeCloseTo(200);expect(vi.mocked(ctx.lineTo).mock.calls[1][1]).toBeCloseTo(400);expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });
  it('keeps marks registered to the same cropped source area and draws a visible arrowhead',()=>{
    const ctx={beginPath:vi.fn(),ellipse:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn()} as unknown as CanvasRenderingContext2D;
    drawMarks(ctx,400,400,[{mode:'circle',x:.1,y:.2,endX:.5,endY:.6},{mode:'arrow',x:.1,y:.2,endX:.5,endY:.6}],{x:.1,y:.2,w:.4,h:.4});
    const ellipse=vi.mocked(ctx.ellipse).mock.calls[0];for(const [actual,expected]of [[ellipse[0],200],[ellipse[1],200],[ellipse[2],200],[ellipse[3],200]])expect(actual).toBeCloseTo(expected);expect(ctx.lineTo).toHaveBeenCalledTimes(6);expect(ctx.stroke).toHaveBeenCalledTimes(4);
  });
});
