<script setup>
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import PortalLayout from "./PortalLayout.vue";

const { frontmatter } = useData();
</script>

<template>
  <PortalLayout v-if="frontmatter.layout === 'portal'" />
  <DefaultTheme.Layout v-else />
</template>
