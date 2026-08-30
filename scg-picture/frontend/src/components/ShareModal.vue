<template>
  <div>
    <a-modal v-model:open="visible" :title="title" :footer="false" @cancel="closeModal">
      <h4>Copy Share Link</h4>
      <a-typography-link copyable>
        {{ link }}
      </a-typography-link>
      <div style="margin-bottom: 16px" />
      <h4>Scan QR Code on Mobile</h4>
      <a-qrcode :value="link" />
    </a-modal>
  </div>
</template>
<script lang="ts" setup>
import { ref } from 'vue'

interface Props {
  title?: string;
  link?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: "Share Image",
  link: 'https://www.codefather.cn'
})

// 是否可见
const visible = ref(false)

// 打开弹窗
const openModal = () => {
  visible.value = true
}

// 关闭弹窗
const closeModal = () => {
  visible.value = false;
}

// 暴露函数给父组件
defineExpose({
  openModal,
})
</script>
