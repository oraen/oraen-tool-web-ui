import { useDispatch, useSelector } from 'react-redux';
import State from '@/types/store';
import { setTextUtilText, clearTextUtilText } from './action';

export const useTextUtil = () => {
  const dispatch = useDispatch();
  const inputText = useSelector((state: State) => state.textUtil?.inputText || '');

  const setText = (text: string) => {
    dispatch(setTextUtilText(text));
  };

  const clearText = () => {
    dispatch(clearTextUtilText());
  };

  return {
    inputText,
    setText,
    clearText
  };
};
