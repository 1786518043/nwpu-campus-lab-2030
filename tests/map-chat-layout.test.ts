import {describe,expect,it} from 'vitest';
import {mapChatLayout} from '../src/mapChatLayout';

describe('map dialogue projection',()=>{
  it('follows a building as the camera moves without leaving the map',()=>{
    const safe={left:12,top:180,width:850,height:420};
    const a=mapChatLayout(330,430,300,220,safe),b=mapChatLayout(430,470,300,220,safe);
    expect(b.left-a.left).toBe(100);expect(b.top-a.top).toBe(40);
    expect(a.anchorVisible).toBe(true);expect(b.anchorVisible).toBe(true);
  });
  it('keeps long feedback inside narrow maps and clear of the right-hand controls',()=>{
    const safe={left:12,top:190,width:240,height:350};
    for(const [x,y] of [[0,0],[160,310],[600,800]]){
      const card=mapChatLayout(x,y,240,300,safe);
      expect(card.left).toBe(12);expect(card.top).toBeGreaterThanOrEqual(190);
      expect(card.left+240).toBeLessThanOrEqual(252);expect(card.top+300).toBeLessThanOrEqual(540);
    }
  });
  it('does not draw a misleading leader for an offscreen building',()=>{
    const safe={left:12,top:180,width:850,height:420};
    expect(mapChatLayout(-400,300,300,220,safe).anchorVisible).toBe(false);
    expect(mapChatLayout(400,1200,300,220,safe).anchorVisible).toBe(false);
  });
});
