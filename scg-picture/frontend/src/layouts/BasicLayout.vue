<template>
  <div id="basicLayout">
    <a-layout class="app-layout">
      <a-layout-header class="header">
        <GlobalHeader />
      </a-layout-header>
      <a-layout>
        <GlobalSider class="sider" />
        <a-layout-content class="content">
          <div class="page-frame">
            <router-view />
          </div>
        </a-layout-content>
      </a-layout>
      <a-layout-footer class="footer">
        <span>SCG Cloud Gallery</span>
        <span class="footer-dot">•</span>
        <a href="https://github.com/supperH" target="_blank" rel="noreferrer">GitHub</a>
      </a-layout-footer>
    </a-layout>
  </div>
</template>

<script setup lang="ts">
import GlobalHeader from '@/components/GlobalHeader.vue'
import GlobalSider from "@/components/GlobalSider.vue";
</script>

<style scoped>
#basicLayout .app-layout {
  min-height: 100vh;
  background: var(--scg-bg);
}

#basicLayout .header {
  position: sticky;
  z-index: 100;
  top: 0;
  height: 68px;
  padding-inline: clamp(16px, 3vw, 40px);
  background: rgba(6, 20, 38, 0.94);
  border-bottom: 1px solid var(--scg-border);
  box-shadow: 0 12px 36px rgba(0, 5, 18, 0.18);
  backdrop-filter: blur(18px);
}

#basicLayout .sider {
  background: #08182b;
  border-right: 1px solid var(--scg-border);
  padding-top: 18px;
}

#basicLayout :deep(.ant-menu-root) {
  border-bottom: none !important;
  border-inline-end: none !important;
}

#basicLayout .content {
  min-width: 0;
  padding: clamp(20px, 2vw, 30px) clamp(20px, 3vw, 40px) clamp(28px, 3vw, 40px);
  background: var(--scg-bg);
}

#basicLayout .page-frame {
  width: min(1600px, 100%);
  min-height: calc(100vh - 154px);
  margin: 0 auto;
}

#basicLayout .footer {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 18px;
  background: #07172a;
  color: var(--scg-text-muted);
  border-top: 1px solid var(--scg-border);
  text-align: center;
}

#basicLayout .footer a {
  color: #7dd3fc;
}

#basicLayout .footer-dot {
  opacity: 0.45;
}

@media (max-width: 768px) {
  #basicLayout .header {
    height: auto;
    min-height: 64px;
    padding-inline: 14px;
  }

  #basicLayout .content {
    padding: 18px 14px 24px;
  }
}
</style>
