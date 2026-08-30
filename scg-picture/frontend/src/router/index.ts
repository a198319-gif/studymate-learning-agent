import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/HomePage.vue'),
    },
    {
      path: '/user/login',
      name: 'User Login',
      component: () => import('@/pages/user/UserLoginPage.vue'),
    },
    {
      path: '/user/register',
      name: 'User Register',
      component: () => import('@/pages/user/UserRegisterPage.vue'),
    },
    {
      path: '/admin/userManage',
      name: 'User Management',
      component: () => import('@/pages/admin/UserManagePage.vue'),
    },
    {
      path: '/admin/pictureManage',
      name: 'Picture Management',
      component: () => import('@/pages/admin/PictureManagePage.vue'),
    },
    {
      path: '/admin/spaceManage',
      name: 'Space Management',
      component: () => import('@/pages/admin/SpaceManagePage.vue'),
    },
    {
      path: '/spaceUserManage/:id',
      name: 'Space Members Management',
      component: () => import('@/pages/admin/SpaceUserManagePage.vue'),
      props: true,
    },
    {
      path: '/add_picture',
      name: 'Create Image',
      component: () => import('@/pages/AddPicturePage.vue'),
    },
    {
      path: '/add_picture/batch',
      name: 'Batch Create Images',
      component: () => import('@/pages/AddPictureBatchPage.vue'),
    },
    {
      path: '/picture/:id',
      name: 'Image Detail',
      component: () => import('@/pages/PictureDetailPage.vue'),
      props: true,
    },
    {
      path: '/add_space',
      name: 'Create Space',
      component: () => import('@/pages/AddSpacePage.vue'),
    },
    {
      path: '/my_space',
      name: 'My Space',
      component: () => import('@/pages/MySpacePage.vue'),
    },
    {
      path: '/space/:id',
      name: 'Space Detail',
      component: () => import('@/pages/SpaceDetailPage.vue'),
      props: true,
    },
    {
      path: '/space_analyze',
      name: 'Space Analysis',
      component: () => import('@/pages/SpaceAnalyzePage.vue'),
    },
    {
      path: '/search_picture',
      name: 'Image Search',
      component: () => import('@/pages/SearchPicturePage.vue'),
    },
    {
      path: '/user_exchange_vip',
      name: 'Exchange VIP',
      component: () => import('@/pages/UserExchangeVipPage.vue'),
    },
    {
      path: '/ai_generate_picture',
      name: 'AI Generate Picture',
      component: () => import('@/pages/AiGeneratePicturePage.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue'),
    },
  ],
})

export default router
