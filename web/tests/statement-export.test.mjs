import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";
import ts from "typescript";
import {createCanvas,Image} from "@napi-rs/canvas";
import JSZip from "jszip";
const require=createRequire(import.meta.url),web=path.resolve(import.meta.dirname,".."),output=path.join(web,".regression-artifacts");fs.mkdirSync(output,{recursive:true});
const compiled=ts.transpileModule(fs.readFileSync(path.join(web,"lib/statement-export.ts"),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const text=[];class LogoImage extends Image{set src(value){super.src=fs.readFileSync(path.join(web,"public",value));}}
const mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require,Blob,Uint8Array,setTimeout,clearTimeout,Image:LogoImage,document:{createElement(tag){assert.equal(tag,"canvas");const canvas=createCanvas(1240,1754),ctx=canvas.getContext("2d"),draw=ctx.fillText.bind(ctx);ctx.fillText=(...args)=>{text.push(args[0]);draw(...args);};canvas.toBlob=cb=>cb(new Blob([canvas.toBuffer("image/png")],{type:"image/png"}));return canvas;}}});const subject=mod.exports;
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const fixture={profile:{full_name:"Sample Member",username:"sample.member",mobile_number:"0300-0000000",city:"Karachi",status:"active",created_at:"2026-08-29"},deposits:Array.from({length:12},(_,i)=>({id:id(1000+i),amount:5000,status:"approved",created_at:"2026-09-01"})),payouts:Array.from({length:15},(_,i)=>({id:id(2000+i),amount:400,month:i%12+1,year:2025+Math.floor(i/12),status:"paid",created_at:"2026-10-29"})),withdrawals:Array.from({length:13},(_,i)=>({id:id(3000+i),amount:400,fee:100,net_amount:300,status:"completed",processed_at:"2026-10-29"})),returns:[{id:id(4000),amount:5000,returned_amount:5000,status:"completed",completed_at:"2026-10-29"}],summary:{totalDeposited:60000,totalPayouts:6000,totalWithdrawn:3900,totalWithdrawalFees:1300,totalReturnedPrincipal:5000}};
for(const language of ["en","ur"])test(`long ${language} statements preserve every page in PDF, Word and image downloads`,async()=>{
 text.length=0;const data={...fixture,profile:{...fixture.profile,full_name:language==="ur"?"نمونہ ممبر":"Sample Member"}};
 const png=await subject.statementExport(data,language,"png");assert.ok(png.filename.endsWith("-PNG-pages.zip"));const zip=await JSZip.loadAsync(await png.blob.arrayBuffer()),pages=Object.keys(zip.files);assert.ok(pages.length>=2);
 const first=await zip.file(pages[0]).async("nodebuffer");assert.equal(first.readUInt32BE(16),1240);assert.equal(first.readUInt32BE(20),1754);fs.writeFileSync(path.join(output,`statement-${language}.png`),first);
 for(const needed of ["TDX INVESTMENT","0308-3958294",id(1011),id(2014),id(3012),id(4000),"Rs 3,900.00"])assert.ok(text.some(value=>value.includes(needed)),"missing "+needed);
 assert.equal(text.some(t=>t.includes("undefined%")||t.includes("Invalid Date")),false);
 const pdf=await subject.statementExport(data,language,"pdf"),bytes=Buffer.from(await pdf.blob.arrayBuffer());assert.equal((bytes.toString("latin1").match(/\/Type \/Page\b/g)??[]).length,pages.length);fs.writeFileSync(path.join(output,`statement-${language}.pdf`),bytes);
 const word=await subject.statementExport(data,language,"word"),doc=await JSZip.loadAsync(await word.blob.arrayBuffer()),xml=await doc.file("word/document.xml").async("string");assert.equal((xml.match(/<w:pageBreakBefore/g)??[]).length,pages.length-1);assert.ok(xml.includes(id(3012)));fs.writeFileSync(path.join(output,`statement-${language}.docx`),Buffer.from(await word.blob.arrayBuffer()));
});
test("empty statements create one image and missing amounts remain unknown",async()=>{
 assert.equal(subject.statementMoney(null),"—");assert.equal(subject.statementMoney(undefined),"—");text.length=0;const file=await subject.statementExport({...fixture,deposits:[],payouts:[],withdrawals:[],returns:[]},"en","png");assert.ok(file.filename.endsWith(".png"));assert.equal(text.filter(t=>t==="No records").length,4);
});
