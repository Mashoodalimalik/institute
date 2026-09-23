import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect x="8" y="8" width="240" height="240" rx="54" fill="#6d28d9"/><path d="M38 102 128 58 218 102 128 146Z" fill="white"/><path d="M72 135V176Q128 211 184 176V135L128 162Z" fill="#ddd6fe"/><path d="M211 111V174" stroke="white" stroke-width="10" stroke-linecap="round"/><circle cx="211" cy="183" r="9" fill="white"/></svg>`;
const sizes=[16,24,32,48,64,128,256];
const images=await Promise.all(sizes.map(size=>sharp(Buffer.from(svg)).resize(size,size).png().toBuffer()));
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
sizes.forEach((size,i)=>{const e=6+16*i;header[e]=header[e+1]=size===256?0:size;header.writeUInt16LE(1,e+4);header.writeUInt16LE(32,e+6);header.writeUInt32LE(images[i].length,e+8);header.writeUInt32LE(offset,e+12);offset+=images[i].length;});
await writeFile(new URL('./okasha.ico',import.meta.url),Buffer.concat([header,...images]));
await writeFile(new URL('./okasha.svg',import.meta.url),svg);
await writeFile(new URL('./okasha.png',import.meta.url),images.at(-1));
console.log('Built institute icon');
