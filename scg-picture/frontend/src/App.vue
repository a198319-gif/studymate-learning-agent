<template>
  <div id="app">
    <a-config-provider :locale="enUS" :theme="themeConfig">
      <BasicLayout />
    </a-config-provider>
  </div>
</template>

<script setup lang="ts">
import enUS from 'ant-design-vue/es/locale/en_US';
import { theme } from 'ant-design-vue'
import type { ThemeConfig } from 'ant-design-vue/es/config-provider/context'
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

import BasicLayout from '@/layouts/BasicLayout.vue'
import { healthUsingGet } from '@/api/mainController.ts'

const themeConfig: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#22d3c5',
    colorInfo: '#38bdf8',
    colorBgBase: '#061426',
    colorBgContainer: '#0b1d33',
    colorBgElevated: '#10243c',
    colorBorder: 'rgba(148, 163, 184, 0.2)',
    colorText: '#e8f2ff',
    colorTextSecondary: '#90a4bd',
    borderRadius: 10,
    controlHeight: 40,
    fontFamily: "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  components: {
    Menu: {
      colorItemBg: 'transparent',
      colorSubItemBg: 'transparent',
      colorItemBgSelected: 'rgba(34, 211, 197, 0.12)',
      colorItemTextSelected: '#5eead4',
    },
  },
}
// import {useLoginUserStore} from "@/stores/useLoginUserStore.ts";

// 已经改为在权限校验文件中获取
// const loginUserStore = useLoginUserStore()
// loginUserStore.fetchLoginUser()

healthUsingGet().then((res) => {
  console.log(res)
})
</script>

<style scoped></style>
