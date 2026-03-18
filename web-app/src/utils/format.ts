const RawDatatoJson=(MesData:any)=>{
    var enc = new TextDecoder("utf-8");
    var uint8_msg = new Uint8Array(MesData);
    const data=enc.decode(uint8_msg)
    return JSON.parse(data)
}