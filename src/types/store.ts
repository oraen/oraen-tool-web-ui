import { MenuState } from "./menu"
import { LayoutMode } from "./layout"
import { StateTheme } from "./theme"
import { TextUtilState } from "@/store/textUtil/reducer"

export interface componentsVisible {
  footer: boolean
  topMenu: boolean
}

export default interface State {
  menu: MenuState
  layout: LayoutMode[]
  componentsVisible: componentsVisible
  theme: StateTheme
  textUtil: TextUtilState
}