import { createStore, combineReducers } from "redux";
import MenuReducer from "./menu/reducer";
import LayoutReducer from "./layout/reducer";
import VisibleReducer from "./visible/reducer";
import ThemeReducer from "./theme/reducer";
import TextUtilReducer from "./textUtil/reducer";
const reducer = combineReducers({
  menu: MenuReducer,
  layout: LayoutReducer,
  componentsVisible: VisibleReducer,
  theme: ThemeReducer,
  textUtil: TextUtilReducer,
});

const store = createStore(
  reducer,
  window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__()
);

export default store;
