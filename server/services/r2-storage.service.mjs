import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readR2Config } from '../config/r2-config.mjs';

/** Server-side storage boundary. Consumers call read/write instead of using the SDK directly. */
export class R2StorageService {
  constructor(config, client) {
    this.bucketName = config.bucketName;
    this.client = client ?? new S3Client({
      region: 'auto',
      endpoint: config.serviceUrl,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      requestHandler: { connectionTimeout: 5000, requestTimeout: 30000, throwOnRequestTimeout: true },
      maxAttempts: 2,
    });
  }

  async write(key, body, { contentType = 'application/octet-stream', fileName = 'file' } = {}) {
    const result = await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: contentType,
      // S3 metadata is ASCII; encode names so Thai and other Unicode names round-trip.
      Metadata: { filename: encodeURIComponent(fileName) },
    }), { abortSignal: AbortSignal.timeout(35000) });
    return { key, fileName, contentType, size: body.length, etag: result.ETag };
  }

  async read(key) {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: key }), {
        abortSignal: AbortSignal.timeout(35000),
      });
      if (!result.Body) throw new Error('R2 returned an empty response body');
      let fileName = 'file';
      try { fileName = decodeURIComponent(result.Metadata?.filename ?? 'file'); } catch { /* retain safe fallback */ }
      return {
        key, body: result.Body, fileName,
        contentType: result.ContentType ?? 'application/octet-stream',
        size: result.ContentLength, etag: result.ETag,
      };
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }
  async delete(key) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }), {
      abortSignal: AbortSignal.timeout(35000),
    });
  }

  async list(prefix, cursor) {
    const result = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucketName, Prefix: prefix, ContinuationToken: cursor, MaxKeys: 100,
    }), { abortSignal: AbortSignal.timeout(35000) });
    return {
      keys: (result.Contents ?? []).map(object => object.Key),
      cursor: result.IsTruncated ? result.NextContinuationToken : undefined,
    };
  }
}

let sharedStorage;
export function getR2StorageService() {
  // Lazy validation lets the existing local APIs run before R2 is configured.
  return sharedStorage ??= new R2StorageService(readR2Config());
}
