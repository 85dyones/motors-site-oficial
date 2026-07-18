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
    let authError = null;

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
        const { data, error } = await client.auth.getUser();
        if (data?.user) {
          user = data.user;
          requestSupabase = client;
        } else {
          authError = error;
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
    const type = formData.get("type") as string; // 'logo' | 'favicon'
    const s3AccessKeyId = formData.get("s3AccessKeyId") as string | null;
    const s3SecretAccessKey = formData.get("s3SecretAccessKey") as string | null;

    if (!file || !type) {
      return NextResponse.json({ error: "Arquivo ou tipo não fornecido." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.type === 'image/png' ? 'png' : 'webp';
    const fileName = `${type}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${fileExt}`;
    const filePath = `uploads/${fileName}`; // Uploading inside 'branding' bucket

    // Check if S3 credentials are provided, use S3 SDK for Supabase Storage
    if (s3AccessKeyId && s3SecretAccessKey && supabaseUrl) {
      const projectId = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
      if (projectId) {
        const s3Endpoint = `https://${projectId}.supabase.co/storage/v1/s3`;
        const s3Client = new S3Client({
          forcePathStyle: true,
          region: "sa-east-1", // Standard fallback for Supabase S3
          endpoint: s3Endpoint,
          credentials: {
            accessKeyId: s3AccessKeyId,
            secretAccessKey: s3SecretAccessKey,
          },
        });

        // Ensure bucket exists
        try {
          await s3Client.send(new HeadBucketCommand({ Bucket: 'branding' }));
        } catch (error: any) {
          if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            try {
              await s3Client.send(new CreateBucketCommand({ Bucket: 'branding' }));
              // Wait a little bit for the bucket to be available
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (createErr: any) {
              console.warn("Failed to create bucket with S3:", createErr);
              return NextResponse.json({ error: "Falha ao criar bucket 'branding' via S3. Crie manualmente no painel do Supabase." }, { status: 500 });
            }
          }
        }

        try {
          await s3Client.send(new PutObjectCommand({
            Bucket: 'branding',
            Key: filePath,
            Body: buffer,
            ContentType: file.type,
            // ACL mapping for Supabase S3 to make it public if bucket is public, but let's omit ACL to rely on bucket policies or default
          }));
          
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/branding/${filePath}`;
          return NextResponse.json({ success: true, url: publicUrl });
        } catch (uploadErr: any) {
          return NextResponse.json({ error: `Erro de Upload S3: ${uploadErr.message}` }, { status: 500 });
        }
      }
    }

    // Fallback: We will upload to the "branding" bucket using Supabase JS client
    const { error: uploadError } = await requestSupabase.storage
      .from('branding')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      // If error is bucket not found, try creating it
      if (uploadError.message.includes("Bucket not found") || uploadError.message.includes("bucket not found") || uploadError.message.includes("Object not found")) {
         const { error: createError } = await requestSupabase.storage.createBucket('branding', { public: true });
         if (!createError) {
             const { error: retryError } = await requestSupabase.storage
                .from('branding')
                .upload(filePath, buffer, {
                  contentType: file.type,
                  upsert: true
                });
             if (retryError) {
                 return NextResponse.json({ error: `Erro ao fazer upload após criar bucket: ${retryError.message}` }, { status: 500 });
             }
         } else {
             return NextResponse.json({ error: `O bucket 'branding' não existe e você não tem permissão para criá-lo automaticamente via API. Por favor, acesse o painel do Supabase, vá em Storage e crie um bucket público chamado 'branding'.` }, { status: 500 });
         }
      } else {
         return NextResponse.json({ error: `Erro ao fazer upload para o Supabase: ${uploadError.message}` }, { status: 500 });
      }
    }

    // Get public URL
    const { data: { publicUrl } } = requestSupabase.storage
      .from('branding')
      .getPublicUrl(filePath);

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error: any) {
    console.error("[Upload API] Failed:", error);
    return NextResponse.json({ error: "Falha interna no servidor." }, { status: 500 });
  }
}
