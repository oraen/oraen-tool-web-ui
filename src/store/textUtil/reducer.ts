export interface TextUtilState {
  inputText: string;
}

const initialState: TextUtilState = {
  inputText: ''
};

export default function reducer(
  state: TextUtilState = initialState, 
  action: { type: string; inputText?: string }
) {
  const { type, inputText } = action;
  switch (type) {
    case 'textUtil/set':
      return { ...state, inputText: inputText || '' };
    case 'textUtil/clear':
      return { ...state, inputText: '' };
    default:
      return state;
  }
}
