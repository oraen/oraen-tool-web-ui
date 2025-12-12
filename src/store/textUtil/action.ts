export const setTextUtilText = (inputText: string) => ({
  type: 'textUtil/set',
  inputText
});

export const clearTextUtilText = () => ({
  type: 'textUtil/clear'
});
