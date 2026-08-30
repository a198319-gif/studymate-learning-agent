<template>
  <div id="globalHeader">
    <a-row :wrap="false" align="middle" class="header-row">
      <a-col flex="240px" class="brand-column">
        <router-link to="/">
          <div class="title-bar">
            <img class="logo" src="../assets/logo.png" alt="logo" />
            <div class="title">SCG Cloud Gallery</div>
          </div>
        </router-link>
      </a-col>
      <a-col flex="auto" class="navigation-column">
        <a-menu
          v-model:selectedKeys="current"
          mode="horizontal"
          :items="items"
          @click="doMenuClick"
        />
      </a-col>
      <!-- 用户信息展示栏 -->
      <a-col flex="160px" class="account-column">
        <div class="user-login-status">
          <div v-if="loginUserStore.loginUser.id" class="account-menu">
            <a-dropdown>
              <a-space>
                <a-avatar :src="loginUserStore.loginUser.userAvatar" />
                {{ loginUserStore.loginUser.userName ?? 'Anonymous' }}
              </a-space>
              <template #overlay>
                <a-menu>
                  <a-menu-item>
                    <router-link to="/my_space">
                      <UserOutlined />
                      My Space
                    </router-link>
                  </a-menu-item>
                  <a-menu-item @click="doLogout">
                    <LogoutOutlined />
                    Logout
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
          <div v-else>
            <a-button type="primary" href="/user/login" class="login-button">Login</a-button>
          </div>
        </div>
      </a-col>
    </a-row>
  </div>
</template>
<script lang="ts" setup>
import { computed, h, ref } from 'vue'
import { HomeOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import type { MenuProps } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { useLoginUserStore } from '@/stores/useLoginUserStore.ts'
import { userLogoutUsingPost } from '@/api/userController.ts'

const loginUserStore = useLoginUserStore()

// 未经过滤的菜单项
const originItems = [
  {
    key: '/',
    icon: () => h(HomeOutlined),
    label: 'Home',
    title: 'Home',
  },
  {
    key: '/add_picture',
    label: 'Create Image',
    title: 'Create Image',
  },
  {
    key: '/ai_generate_picture',
    label: 'AI Image Generate',
    title: 'AI Image Generate',
  },
  {
    key: '/admin/userManage',
    label: 'User Management',
    title: 'User Management',
  },
  {
    key: '/admin/pictureManage',
    label: 'Picture Management',
    title: 'Picture Management',
  },
  {
    key: '/admin/spaceManage',
    label: 'Space Management',
    title: 'Space Management',
  },
  // {
  //   key: 'others',
  //   label: h('a', { href: 'https://www.codefather.cn', target: '_blank' }, '编程导航'),
  //   title: '编程导航',
  // },
]

// 根据权限过滤菜单项
const filterMenus = (menus = [] as MenuProps['items']) => {
  return menus?.filter((menu) => {
    // 管理员才能看到 /admin 开头的菜单
    if (String(menu?.key ?? '').startsWith('/admin')) {
      const loginUser = loginUserStore.loginUser
      if (!loginUser || loginUser.userRole !== 'admin') {
        return false
      }
    }
    return true
  })
}

// 展示在菜单的路由数组
const items = computed(() => filterMenus(originItems))

const router = useRouter()
// 当前要高亮的菜单项
const current = ref<string[]>([])
// 监听路由变化，更新高亮菜单项
router.afterEach((to, from, next) => {
  current.value = [to.path]
})

// 路由跳转事件
const doMenuClick: MenuProps['onClick'] = ({ key }) => {
  router.push({
    path: String(key),
  })
}

// 用户注销
const doLogout = async () => {
  const res = await userLogoutUsingPost()
  if (res.data.code === 0) {
    loginUserStore.setLoginUser({
      userName: 'Not logged in',
    })
    message.success('Logout successful')
    await router.push('/user/login')
  } else {
    message.error('Logout failed, ' + res.data.message)
  }
}
</script>

<style scoped>
#globalHeader .title-bar {
  display: flex;
  align-items: center;
  height: 68px;
}

.title {
  color: var(--scg-text);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
  margin-left: 12px;
  white-space: nowrap;
}

.logo {
  width: 42px;
  height: 42px;
  object-fit: cover;
  border: 1px solid rgba(94, 234, 212, 0.3);
  border-radius: 8px;
  box-shadow: 0 0 24px rgba(34, 211, 197, 0.12);
}

#globalHeader :deep(.ant-menu-horizontal) {
  min-width: 0;
  background: transparent;
  line-height: 67px;
}

#globalHeader :deep(.ant-menu-horizontal > .ant-menu-item) {
  margin-inline: 2px;
  padding-inline: 16px;
  color: #afc0d4;
}

#globalHeader :deep(.ant-menu-horizontal > .ant-menu-item:hover),
#globalHeader :deep(.ant-menu-horizontal > .ant-menu-item-selected) {
  color: #f5fbff;
}

#globalHeader :deep(.ant-menu-horizontal > .ant-menu-item::after) {
  border-bottom-width: 2px;
  border-bottom-color: transparent;
}

#globalHeader :deep(.ant-menu-horizontal > .ant-menu-item:hover::after),
#globalHeader :deep(.ant-menu-horizontal > .ant-menu-item-selected::after) {
  border-bottom-color: var(--scg-accent);
}

.account-column {
  text-align: right;
}

.user-login-status {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.account-menu {
  min-width: 0;
  max-width: 160px;
  color: var(--scg-text);
  cursor: pointer;
}

.login-button {
  min-width: 72px;
  border: 0;
}

@media (max-width: 920px) {
  .brand-column {
    flex: 0 0 62px !important;
    max-width: 62px;
  }

  .title {
    display: none;
  }

  #globalHeader :deep(.ant-menu-horizontal > .ant-menu-item) {
    padding-inline: 10px;
  }
}

@media (max-width: 640px) {
  .header-row {
    min-height: 64px;
  }

  .brand-column {
    flex-basis: 46px !important;
    max-width: 46px;
  }

  .logo {
    width: 36px;
    height: 36px;
  }

  .navigation-column {
    min-width: 0;
    overflow: hidden;
  }

  #globalHeader :deep(.ant-menu-horizontal) {
    min-width: 0;
    line-height: 63px;
  }

  .account-column {
    flex: 0 0 74px !important;
    max-width: 74px;
  }

  .account-menu :deep(.ant-space-item:last-child) {
    display: none;
  }
}
</style>
