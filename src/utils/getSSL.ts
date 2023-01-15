import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

//docker环境下 暴露的配置文件
let imageCertificate =
  // @ts-ignore
  import.meta.glob("../../userConfig/ssl/certificate.crt", {
    import: "default",
    eager: true,
    as: "raw",
  }) || undefined;

imageCertificate =
  imageCertificate[Object.keys(imageCertificate)[0]] || undefined;

//docker环境下 暴露的配置文件
let imageDhparam =
  // @ts-ignore
  import.meta.glob("../../userConfig/ssl/dhparam.pem", {
    import: "default",
    eager: true,
    as: "raw",
  }) || undefined;

imageDhparam = imageDhparam[Object.keys(imageDhparam)[0]] || undefined;

//docker环境下 暴露的配置文件
let imagePrivate =
  // @ts-ignore
  import.meta.glob("../../userConfig/ssl/private.key", {
    import: "default",
    eager: true,
    as: "raw",
  }) || undefined;

imagePrivate = imagePrivate[Object.keys(imagePrivate)[0]] || undefined;

export const getSSL = async () => {
  return {
    certificate:
      imageCertificate ||
      (await readFile(resolve(`src/ssl/certificate.crt`))).toString(),
    dhparam:
      imageDhparam ||
      (await readFile(resolve(`src/ssl/dhparam.pem`))).toString(),
    private:
      imagePrivate ||
      (await readFile(resolve(`src/ssl/private.key`))).toString(),
  };
};
