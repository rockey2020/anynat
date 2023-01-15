import { randomUUID } from "node:crypto";

export const uuid = (config?: { size: number }): string => {
  const { size = 5 } = config || {};
  const array: Array<string> = [];
  for (let i = 0; i < size; i++) {
    array.push(randomUUID());
  }
  return array.join("-"); //-符号固定值 不可以随意改
};
