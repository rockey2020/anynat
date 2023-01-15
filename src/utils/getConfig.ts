import lodash from "lodash";
import { BaseConfig, baseConfig } from "../../config.base";
import { customizeConfig } from "../../config.customize";

const { cloneDeep, isArray, mergeWith } = lodash;

const customizer = (objValue, srcValue) => {
  if (isArray(objValue)) {
    return srcValue;
  }
};

//用户自定义的配置文件
let imageBaseConfig =
  // @ts-ignore
  import.meta.glob("../../userConfig/config.base.ts", {
    import: "baseConfig",
    eager: true,
  }) || {};

imageBaseConfig = imageBaseConfig[Object.keys(imageBaseConfig)[0]] || {};

//用户自定义的配置文件
let imageCustomizeConfig =
  // @ts-ignore
  import.meta.glob("../../userConfig/config.customize.ts", {
    import: "customizeConfig",
    eager: true,
  }) || {};

imageCustomizeConfig =
  imageCustomizeConfig[Object.keys(imageCustomizeConfig)[0]] || {};

const userConfig = mergeWith(imageBaseConfig, imageCustomizeConfig, customizer);

const baseConfigClone = cloneDeep(baseConfig);

export const getConfig: BaseConfig = mergeWith(
  mergeWith(baseConfigClone, customizeConfig, customizer),
  userConfig,
  customizer,
);
