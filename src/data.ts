import type { Garment, FitSettings } from './types';
const image=(name:string)=>`${import.meta.env.BASE_URL}garments/${name}.svg`;
export const catalogue:Garment[]=[
 {id:'linen',name:'The everyday linen',subtitle:'Relaxed shirt · Sand',category:'top',image:image('linen-shirt'),color:'#b49778'},
 {id:'kurta',name:'A softer tradition',subtitle:'Cotton kurta · Sage',category:'dress',image:image('sage-kurta'),color:'#7f8d78'},
 {id:'dress',name:'The evening edit',subtitle:'Midi dress · Deep forest',category:'dress',image:image('midnight-dress'),color:'#344c4a'},
 {id:'tee',name:'Nothing but essential',subtitle:'Everyday tee · Oat',category:'top',image:image('everyday-tee'),color:'#e2d7c3'},
 {id:'trousers',name:'Room to move',subtitle:'Straight trousers · Charcoal',category:'bottom',image:image('studio-trousers'),color:'#555951'},
 {id:'terra',name:'A warmer outlook',subtitle:'Cotton shirt · Terracotta',category:'top',image:image('terracotta-shirt'),color:'#ae7158'}
];
export const defaultSettings:FitSettings={size:'M',width:100,length:100,offset:0,opacity:100,color:'',pattern:'original',mirror:true,occlusion:true,showGuides:false};
