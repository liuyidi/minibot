import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import ShotStrip from "./ShotStrip.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("ShotStrip", ShotStrip);
  },
};
