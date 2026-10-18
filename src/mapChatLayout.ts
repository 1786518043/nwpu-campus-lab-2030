export type ChatRect={left:number;top:number;width:number;height:number};
const clamp=(value:number,min:number,max:number)=>Math.min(Math.max(value,min),Math.max(min,max));

/** Fit a screen-space bubble beside its projected building, inside the map's controls. */
export function mapChatLayout(x:number,y:number,width:number,height:number,safe:ChatRect){
  const left=clamp(x+24,safe.left,safe.left+safe.width-width);
  const top=clamp(y-height-24,safe.top,safe.top+safe.height-height);
  const anchorVisible=x>=safe.left&&x<=safe.left+safe.width+52&&y>=safe.top&&y<=safe.top+safe.height;
  return {left,top,anchorVisible,lineX:clamp(x,left+12,left+width-12),lineY:clamp(y,top+12,top+height-12)};
}
