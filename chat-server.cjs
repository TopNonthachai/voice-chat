const { randomUUID } = require('node:crypto');
const express = require('express');
const MAX_FILE = 5 * 1024 * 1024;
function registerChat(io, app, getProfile, {now=Date.now,fileTtlMs=24*60*60*1000,cleanupIntervalMs=60000}={}) {
    const rooms = new Map();
    const files = new Map();
    let totalBytes = 0;
    const roomState = id => {if (!rooms.has(id)) rooms.set(id,{messages:[],bytes:0,sequence:0});return rooms.get(id);};
    const sweepExpired=()=>{
        for(const [id,file] of files)if(file.expiresAt<=now()){
            files.delete(id);totalBytes-=file.bytes.length;
            const room=rooms.get(file.roomId);if(room){room.bytes-=file.bytes.length;room.messages.forEach(message=>{if(message.attachment?.id===id)message.attachment.expired=true;});}
            io.to(file.roomId).emit('chat-file-expired',{id});
        }
    };
    const cleanup=setInterval(sweepExpired,cleanupIntervalMs);cleanup.unref();
    io.httpServer?.once('close',()=>clearInterval(cleanup));
    const member = (roomId, clientId) => {
        const socket = typeof clientId === 'string' ? io.sockets.sockets.get(clientId) : null;
        return socket && socket.data.roomId === roomId && socket.rooms.has(roomId) ? socket : null;
    };
    const accept = socket => {
        const timestamp = now();
        if (!socket.data.chatRate || socket.data.chatRate.until <= timestamp) socket.data.chatRate={until:timestamp+10000,count:0};
        return ++socket.data.chatRate.count <= 10;
    };
    const publish = (socket, roomId, clientId, text, attachment) => {
        const room = roomState(roomId);
        const profile = getProfile(roomId,socket.data.userId) || {};
        const message = {id:randomUUID(),sequence:++room.sequence,clientId,senderId:socket.data.userId,senderSocketId:socket.id,name:profile.name || socket.data.userName || 'Guest',avatar:profile.avatar || '🌻',text,timestamp:now(),attachment};
        room.messages.push(message);
        while(room.messages.length>100){const old=room.messages.shift();if(old.attachment){const file=files.get(old.attachment.id);if(file){room.bytes-=file.bytes.length;totalBytes-=file.bytes.length;files.delete(old.attachment.id);}}}
        io.to(roomId).emit('chat-message',message);
        return message;
    };
    const existing = (room,socket,clientId) => room.messages.find(m=>m.clientId===clientId && m.senderId===socket.data.userId);
    const validId = id => typeof id==='string' && /^[a-zA-Z0-9-]{8,80}$/.test(id);
    io.on('connection',socket=>{
        socket.on('chat-sync',({roomId}={})=>{if(member(roomId,socket.id)){sweepExpired();socket.emit('chat-history',roomState(roomId).messages);}});
        socket.on('chat-send',(data={},ack=()=>{})=>{
            if(typeof ack!=='function') ack=()=>{};
            const {roomId,clientId,text}=data || {};
            if(!member(roomId,socket.id)) return ack({error:'กรุณาเข้าห้องก่อนส่งข้อความ'});
            if(!validId(clientId)) return ack({error:'ส่งข้อความไม่ได้ กรุณาลองใหม่'});
            const old=existing(roomState(roomId),socket,clientId);if(old)return ack({ok:true,message:old});
            if(typeof text!=='string' || !text.trim() || text.trim().length>1000) return ack({error:'ข้อความต้องมี 1–1,000 ตัวอักษร'});
            if(!accept(socket)) return ack({error:'ส่งข้อความถี่ไปนิด รอสักครู่แล้วลองใหม่ครับ'});
            ack({ok:true,message:publish(socket,roomId,clientId,text.trim())});
        });
    });
    const authorize=(req,res,next)=>{
        const socket=member(req.query.roomId,req.query.clientId);
        if(!socket)return res.status(403).json({error:'กรุณาเชื่อมต่อห้องก่อนส่งหรือดาวน์โหลดไฟล์'});
        sweepExpired();req.chatSocket=socket;next();
    };
    app.post('/api/chat/files',authorize,express.raw({type:'application/octet-stream',limit:MAX_FILE}),(req,res)=>{
        const socket=req.chatSocket,roomId=req.query.roomId,clientId=req.query.uploadId;
        if(!validId(clientId))return res.status(400).json({error:'รหัสการอัปโหลดไม่ถูกต้อง'});
        const room=roomState(roomId),old=existing(room,socket,clientId);
        if(old)return res.json({ok:true,message:old});
        if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'กรุณาเลือกไฟล์ที่ไม่ว่าง'});
        if(room.bytes+req.body.length>20*1024*1024 || totalBytes+req.body.length>100*1024*1024)return res.status(413).json({error:'พื้นที่แนบไฟล์ชั่วคราวเต็มแล้ว ลองใหม่ภายหลังครับ'});
        if(!accept(socket))return res.status(429).json({error:'ส่งข้อความถี่ไปนิด รอสักครู่แล้วลองใหม่ครับ'});
        let name;try{name=decodeURIComponent(req.get('X-File-Name')||'file');}catch{return res.status(400).json({error:'ชื่อไฟล์ไม่ถูกต้อง'});}
        name=name.replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,180)||'file';
        let text;try{text=decodeURIComponent(req.get('X-Chat-Text')||'').trim();}catch{return res.status(400).json({error:'ข้อความไม่ถูกต้อง'});}
        if(text.length>1000)return res.status(400).json({error:'ข้อความยาวเกิน 1,000 ตัวอักษร'});
        const bytes=req.body;let imageType=null;
        if(bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))imageType='image/png';
        else if(bytes.length>=3 && bytes[0]===255&&bytes[1]===216&&bytes[2]===255)imageType='image/jpeg';
        else if(bytes.length>=6 && ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)))imageType='image/gif';
        else if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')imageType='image/webp';
        const id=randomUUID(),expiresAt=now()+fileTtlMs,attachment={id,name,size:bytes.length,image:Boolean(imageType),expiresAt};
        files.set(id,{roomId,bytes,imageType,name,expiresAt});room.bytes+=bytes.length;totalBytes+=bytes.length;
        res.json({ok:true,message:publish(socket,roomId,clientId,text,attachment)});
    });
    app.use('/api/chat/files',(err,req,res,next)=>{if(err?.type==='entity.too.large')return res.status(413).json({error:'ไฟล์ใหญ่เกิน 5 MB'});next(err);});
    app.get('/api/chat/files/:id',authorize,(req,res)=>{
        const file=files.get(req.params.id);
        if(!file || file.roomId!==req.query.roomId){
            const expired=rooms.get(req.query.roomId)?.messages.some(message=>message.attachment?.id===req.params.id&&message.attachment.expired);
            return res.status(expired?410:404).json({error:expired?'ไฟล์หมดอายุแล้ว (24 ชั่วโมงหลังส่ง)':'ไม่พบไฟล์ในห้องนี้'});
        }
        const preview=req.query.preview==='1';
        if(preview&&!file.imageType)return res.status(415).json({error:'ไฟล์ชนิดนี้ไม่มีภาพตัวอย่าง'});
        res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff').set('Content-Security-Policy',"default-src 'none'; sandbox");
        const filename=encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
        res.set('Content-Disposition',`${preview?'inline':'attachment'}; filename="download"; filename*=UTF-8''${filename}`);
        res.type(preview?file.imageType:'application/octet-stream').send(file.bytes);
    });
    return {rooms,files,sweepExpired};
}
module.exports={registerChat};
