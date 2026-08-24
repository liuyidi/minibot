<script setup>
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import DownloadLayout from "./DownloadLayout.vue";
import PortalLayout from "./PortalLayout.vue";

const { frontmatter } = useData();
</script>

<template>
  <PortalLayout v-if="frontmatter.layout === 'portal'" />
  <DownloadLayout v-else-if="frontmatter.layout === 'download'" />
  <DefaultTheme.Layout v-else />
</template>
