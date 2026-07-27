import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

    let requestSupabase: any = null;
    let user = null;

    // 1. Try cookie-based session first
    try {
      const client = await createServerSupabaseClient();
      const { data } = await client.auth.getUser();
      if (data?.user) {
        user = data.user;
        requestSupabase = client;
      }
    } catch (err: any) {
      console.warn("[Upload API] Cookie-based auth check failed:", err.message);
    }

    // 2. Fallback to header-based Bearer token
    if (!user && token) {
      try {
        const client = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        });
        const { data } = await client.auth.getUser();
        if (data?.user) {
          user = data.user;
          requestSupabase = client;
        }
      } catch (err: any) {
        console.warn("[Upload API] Token-based auth check failed:", err.message);
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Sessão inválida ou ausente. Faça login novamente." }, { status: 401 });
    }

    // Process FormData
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string; // 'logo' | 'favicon' | 'banner'
    const s3AccessKeyId = formData.get("s3AccessKeyId") as string | null;
    const s3SecretAccessKey = formData.get("s3SecretAccessKey") as string | null;

    if (!file || !type) {
      return NextResponse.json({ error: "Arquivo ou tipo não fornecido." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.type === 'image/png' ? 'png' : (file.type === 'image/jpeg' || file.type === 'image/jpg') ? 'jpg' : 'webp';
    const fileName = `${type}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    // Method 1: Try S3 Upload if credentials exist
    if (s3AccessKeyId && s3SecretAccessKey && supabaseUrl) {
      const projectId = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
      if (projectId) {
        try {
          const s3Endpoint = `https://${projectId}.supabase.co/storage/v1/s3`;
          const s3Client = new S3Client({
            forcePathStyle: true,
            region: "sa-east-1",
            endpoint: s3Endpoint,
            credentials: {
              accessKeyId: s3AccessKeyId.trim(),
              secretAccessKey: s3SecretAccessKey.trim(),
            },
          });

          // Ensure bucket exists
          try {
            await s3Client.send(new HeadBucketCommand({ Bucket: 'branding' }));
          } catch (error: any) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
              await s3Client.send(new CreateBucketCommand({ Bucket: 'branding' }));
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }

          await s3Client.send(new PutObjectCommand({
            Bucket: 'branding',
            Key: filePath,
            Body: buffer,
            ContentType: file.type || "image/webp",
          }));
          
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/branding/${filePath}`;
          console.log("[Upload API] S3 upload succeeded:", publicUrl);
          return NextResponse.json({ success: true, url: publicUrl, publicUrl });
        } catch (s3Err: any) {
          console.warn("[Upload API] S3 upload attempt failed (signature/auth error), gracefully falling back to Supabase Storage API:", s3Err.message);
        }
      }
    }

    // Method 2: Supabase Storage JS API (Admin / Service Role Client or User Session Client)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const storageClient = serviceRoleKey && supabaseUrl
      ? createClient(supabaseUrl, serviceRoleKey)
      : requestSupabase;

    if (storageClient) {
      try {
        let { error: uploadError } = await storageClient.storage
          .from('branding')
          .upload(filePath, buffer, {
            contentType: file.type || "image/webp",
            upsert: true
          });

        if (uploadError) {
          console.warn("[Upload API] Direct storage upload error:", uploadError.message);
          // Try creating bucket if not exists
          if (uploadError.message.includes("not found") || uploadError.message.includes("NotFound") || uploadError.message.includes("404") || uploadError.message.includes("Bucket")) {
            try {
              await storageClient.storage.createBucket('branding', { public: true });
              const { error: retryError } = await storageClient.storage
                .from('branding')
                .upload(filePath, buffer, {
                  contentType: file.type || "image/webp",
                  upsert: true
                });
              uploadError = retryError;
            } catch (bErr: any) {
              console.warn("[Upload API] Bucket creation failed:", bErr.message);
            }
          }
        }

        if (!uploadError) {
          const { data: { publicUrl } } = storageClient.storage
            .from('branding')
            .getPublicUrl(filePath);
          console.log("[Upload API] Supabase Storage JS upload succeeded:", publicUrl);
          return NextResponse.json({ success: true, url: publicUrl, publicUrl });
        }
      } catch (storageErr: any) {
        console.warn("[Upload API] Supabase storage API failed:", storageErr.message);
      }
    }

    // Method 3: Resilient Fallback - Base64 Data URL (for images <= 3MB)
    if (buffer.length <= 3.5 * 1024 * 1024) {
      const mimeType = file.type || "image/webp";
      const base64Data = buffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      console.log("[Upload API] Fallback to inline Base64 Data URL.");
      return NextResponse.json({ success: true, url: dataUrl, publicUrl: dataUrl });
    }

    return NextResponse.json({ error: "Falha ao realizar upload da imagem." }, { status: 500 });
  } catch (error: any) {
    console.error("[Upload API] Server Error:", error);
    return NextResponse.json({ error: "Falha interna no servidor." }, { status: 500 });
  }
}
