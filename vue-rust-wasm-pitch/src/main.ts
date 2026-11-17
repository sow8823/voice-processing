import './assets/main.css'
import '@mdi/font/css/materialdesignicons.css'

import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'
import App from './App.vue'
import router from './router'

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#4361ee',
          secondary: '#f72585',
          accent: '#3f37c9',
          error: '#d90429',
          info: '#3a86ff',
          success: '#38b000',
          warning: '#ffbe0b',
          background: '#f8f9fa'
        }
      },
      dark: {
        colors: {
          primary: '#4895ef',
          secondary: '#ff4d6d',
          accent: '#4361ee',
          error: '#d90429',
          info: '#3a86ff',
          success: '#38b000',
          warning: '#ffbe0b',
          background: '#121212'
        }
      }
    }
  }
})

const app = createApp(App)

app.use(router)
app.use(vuetify)

app.mount('#app')
