import fs from 'node:fs';
fs.mkdirSync('public/garments',{recursive:true});
const garments=[
 ['linen-shirt','#b49778','#8f745c','top'],
 ['sage-kurta','#7f8d78','#596650','dress'],
 ['midnight-dress','#344c4a','#203633','dress'],
 ['everyday-tee','#e2d7c3','#b7aa91','tee'],
 ['studio-trousers','#555951','#353a32','bottom'],
 ['terracotta-shirt','#ae7158','#7e4a35','top']
];
for(const [id,color,dark,type]of garments){
 const bottom=type==='bottom',dress=type==='dress',tee=type==='tee';
 const shape=bottom?'M120 50 L392 50 414 600 286 600 256 240 226 600 98 600Z':dress?'M154 77 L207 55 Q256 88 305 55 L358 77 505 245 430 295 349 173 409 625 103 625 163 173 82 295 7 245Z':'M154 77 L207 55 Q256 88 305 55 L358 77 505 205 438 285 352 200 355 580 Q256 607 157 580 L160 200 74 285 7 205Z';
 const detail=bottom?'<path d="M120 70h272M256 70v170M152 85q0 75-42 76m250-76q0 75 42 76M182 235l-15 340m163-340 15 340"/>':tee?'<path d="M207 55q49 90 98 0M157 560q99 28 198 0M20 205l58 61m414-61-58 61"/>':'<path d="M207 55L256 94 305 55 288 127 256 102 225 127ZM256 103v475M168 180l-8 340m184-340 8 340M157 570q99 28 198 0"/><path d="M282 190h45v54q-22 23-45 0Z"/>'+[150,214,278,342,406,470,534].map(y=>`<circle cx="257" cy="${y}" r="3.5" fill="${dark}" stroke="none"/>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640" viewBox="0 0 512 640"><defs><linearGradient id="fabric"><stop stop-color="${dark}"/><stop offset=".18" stop-color="${color}"/><stop offset=".45" stop-color="${color}"/><stop offset=".5" stop-color="${dark}" stop-opacity=".82"/><stop offset=".57" stop-color="${color}"/><stop offset=".84" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".10"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter><clipPath id="cut"><path d="${shape}"/></clipPath></defs><g clip-path="url(#cut)"><path d="${shape}" fill="url(#fabric)"/><rect width="512" height="640" fill="${color}" opacity=".18" filter="url(#grain)"/><g stroke="${dark}" stroke-width="2" fill="none" opacity=".6">${detail}</g><path d="M184 240q-18 125 0 310m139-310q18 125 0 310" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="8"/></g></svg>`;
 fs.writeFileSync(`public/garments/${id}.svg`,svg);
}
