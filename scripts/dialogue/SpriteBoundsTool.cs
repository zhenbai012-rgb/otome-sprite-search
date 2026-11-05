// Read native alpha bounds in memory; do not export or compose any image files.
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using GameRes;
class SpriteBoundsTool {
  static JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=int.MaxValue};
  static int[] Alpha(byte[] bytes) {
    using(var ms=new MemoryStream(bytes)) using(var source=new Bitmap(ms))
    using(var image=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppArgb)) {
      using(var g=Graphics.FromImage(image)){g.Clear(Color.Transparent);g.DrawImageUnscaled(source,0,0);}
      var data=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
      try{
        byte[] pixels=new byte[Math.Abs(data.Stride)*image.Height];Marshal.Copy(data.Scan0,pixels,0,pixels.Length);
        int left=image.Width,top=image.Height,right=0,bottom=0;
        for(int y=0;y<image.Height;y++)for(int x=0;x<image.Width;x++)if(pixels[y*Math.Abs(data.Stride)+x*4+3]!=0){left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x+1);bottom=Math.Max(bottom,y+1);}
        return new[]{image.Width,image.Height,right>left?left:0,bottom>top?top:0,right,bottom};
      }finally{image.UnlockBits(data);}
    }
  }
  static int[] Bounds(byte[] bytes){
    if(bytes.Length<20||System.Text.Encoding.ASCII.GetString(bytes,0,4)!="DPNG")return Alpha(bytes);
    using(var input=new BinaryReader(new MemoryStream(bytes))){
      input.BaseStream.Position=8;int count=input.ReadInt32(),width=input.ReadInt32(),height=input.ReadInt32();
      if(count<1||count>100000||width<1||height<1)throw new Exception("Invalid DPNG bounds");
      int left=width,top=height,right=0,bottom=0;
      for(int i=0;i<count;i++){
        int x=input.ReadInt32(),y=input.ReadInt32();input.ReadInt32();input.ReadInt32();int size=input.ReadInt32();input.ReadInt32();input.ReadInt32();
        var tile=input.ReadBytes(size);if(size==0)continue;var b=Alpha(tile);
        if(b[4]>b[2]&&b[5]>b[3]){left=Math.Min(left,x+b[2]);top=Math.Min(top,y+b[3]);right=Math.Max(right,x+b[4]);bottom=Math.Max(bottom,y+b[5]);}
      }
      return new[]{width,height,right>left?left:0,bottom>top?top:0,right,bottom};
    }
  }
  [STAThread]static int Main(string[] args){
    try{
      using(var f=File.OpenRead(Path.Combine(FormatCatalog.Instance.DataDirectory,"Formats.dat")))FormatCatalog.Instance.DeserializeScheme(f);
      var jobs=Json.Deserialize<List<Dictionary<string,object>>>(File.ReadAllText(args[0]));
      int count=0;
      using(var log=new StreamWriter(args[1],true,new System.Text.UTF8Encoding(false)))foreach(var job in jobs){
        using(var arc=ArcFile.TryOpen((string)job["archive"])){
          if(arc==null)throw new Exception("Archive unavailable");var entries=arc.Dir.ToDictionary(e=>e.Name,StringComparer.OrdinalIgnoreCase);
          foreach(var item in Json.ConvertToType<List<Dictionary<string,object>>>(job["entries"])){
            string id=(string)item["id"],expected=(string)item["sha256"];
            try{
              byte[] raw;using(var stream=arc.OpenEntry(entries[(string)item["name"]]))using(var memory=new MemoryStream()){stream.CopyTo(memory);raw=memory.ToArray();}
              string hash;using(var h=SHA256.Create())hash=BitConverter.ToString(h.ComputeHash(raw)).Replace("-","").ToLowerInvariant();if(hash!=expected)throw new Exception("Native image hash mismatch");
              var b=Bounds(raw);log.WriteLine(Json.Serialize(new{id=id,sha256=hash,width=b[0],height=b[1],crop=new[]{b[2],b[3],b[4],b[5]}}));
            }catch(Exception ex){log.WriteLine(Json.Serialize(new{id=id,error=ex.Message}));}
            count++;if(count%250==0){log.Flush();Console.WriteLine("BOUNDS "+count);}
          }
        }
        log.Flush();
      }
      Console.WriteLine("COMPLETE "+count);return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex.ToString());return 1;}
  }
}
