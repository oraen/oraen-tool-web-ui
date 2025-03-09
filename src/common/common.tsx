import * as vkbeautify from 'vkbeautify';


export function isJson (str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

export function isXml(str: string): boolean {
 // return /^\s*<[\s\S]*>\s*$/.test(str);
  return str != null && str.trim() != '' && str.trim()[0] == '<'

}

export function isSql(str: string): boolean {
  return /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+/i.test(str);
}

export function isCsv (str: string): boolean {
  return /^\s*([^,\n]+,)+[^,\n]*\n/.test(str);
}


// JSON 格式化
export function formatJson(str: string):  { result: string; errorMsg: string; isSucceed: boolean } {
  try {
    const obj = JSON.parse(str);
    return {
      result: JSON.stringify(obj, null, 4), // 2 缩进
      errorMsg: '',
      isSucceed: true,
    };
  } catch (e) {
    return {
      result: '',
      errorMsg:  e instanceof Error ? e.message : '未知错误', // 断言为 Error 类型
      isSucceed: false,
    };
  }
}

//XML格式化
export function formatXml(str: string): { result: string; errorMsg: string; isSucceed: boolean } {
  try {

    // 使用 vkbeautify 进行格式化
    const formattedXml = vkbeautify.xml(str, 4);

    return { result: formattedXml, errorMsg: "", isSucceed: true };
  } catch (error) {
    return { result: "", errorMsg: error instanceof Error ? error.message : "Unknown error", isSucceed: false };
  }
}



// SQL 格式化（简单换行）
export function formatSql(str: string): string {
  return str
    .replace(/(SELECT|FROM|WHERE|JOIN|GROUP BY|ORDER BY|LIMIT)/gi, '\n$1') // 关键字换行
    .replace(/,/g, ',\n  ') // 逗号换行
    .trim();
}

// CSV 格式化（简单换行）
export function formatCsv(str: string): string {
  return str
    .split('\n')
    .map(line => line.split(',').join(', ')) // 添加空格
    .join('\n');
}

