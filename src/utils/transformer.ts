import { CoreCrypto, EncryptResult, VersionNo } from "core.crypto";

export default class Transformer {
  public static async stringToUint8Array(message: string): Promise<Uint8Array> {
    return new TextEncoder().encode(message);
  }

  public static async uint8ArrayToString(message: Uint8Array): Promise<string> {
    return new TextDecoder().decode(message);
  }

  public static async encryption(
    coreCrypto: CoreCrypto,
    chunk: Buffer,
  ): Promise<Uint8Array> {
    const data = await coreCrypto.encryption({
      message: chunk,
      version: VersionNo.AES256GCM,
    });

    const sequence = async (encryptResult: EncryptResult) => {
      const version = await Transformer.stringToUint8Array(
        encryptResult.version,
      );
      const messageHash = await Transformer.stringToUint8Array(
        encryptResult.messageHash,
      );

      const sizes = new Uint8Array([
        encryptResult.encryptedData.length,
        encryptResult.additionalData.length,
        encryptResult.messageHash.length,
        encryptResult.version.length,
      ]);

      const merge = new Uint8Array(
        sizes.length +
          encryptResult.encryptedData.length +
          encryptResult.additionalData.length +
          encryptResult.messageHash.length +
          encryptResult.version.length,
      );

      merge.set(sizes);
      merge.set(encryptResult.encryptedData, sizes.length);
      merge.set(
        encryptResult.additionalData,
        sizes.length + encryptResult.encryptedData.length,
      );
      merge.set(
        messageHash,
        sizes.length +
          encryptResult.encryptedData.length +
          encryptResult.additionalData.length,
      );
      merge.set(
        version,
        sizes.length +
          encryptResult.encryptedData.length +
          encryptResult.additionalData.length +
          messageHash.length,
      );

      return merge;
    };

    return await sequence(data);
  }

  public static async decryption(
    coreCrypto: CoreCrypto,
    chunk: Buffer,
  ): Promise<Uint8Array> {
    const sequence = async (chunk: Buffer) => {
      const versionLength = chunk[3];
      const messageHashLength = chunk[2];
      const additionalDataLength = chunk[1];

      const version = await Transformer.uint8ArrayToString(
        chunk.subarray(-versionLength),
      );
      const messageHash = await Transformer.uint8ArrayToString(
        chunk.subarray(-versionLength + -messageHashLength, -versionLength),
      );
      const additionalData = chunk.subarray(
        -versionLength + -messageHashLength + -additionalDataLength,
        -versionLength + -messageHashLength,
      );
      const encryptedData = chunk.subarray(
        4,
        -versionLength + -messageHashLength + -additionalDataLength,
      );

      return {
        version: version as VersionNo,
        messageHash,
        additionalData,
        encryptedData,
      };
    };

    return await coreCrypto.decryption(await sequence(chunk));
  }
}
