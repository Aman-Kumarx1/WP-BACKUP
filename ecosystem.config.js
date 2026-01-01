module.exports = {
  // Application Configuration
  apps: [{
    name: 'main-app',
    script: 'index.js',
    watch: '.',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }, {
    name: 'service-worker',
    script: './service-worker/index.js',
    watch: ['./service-worker'],
    env_production: {
      NODE_ENV: 'production'
    }
  }],

  // Deployment Configuration
  deploy: {
    production: {
      // --- LOCAL SERVER SETTINGS ---
      user: 'amank', // Explicitly set your Windows username
      host: 'localhost',
      
      // --- GITHUB REPOSITORY SETTINGS ---
      ref: 'origin/main', 
      // ⚠️ CRITICAL: You must replace this placeholder with your actual SSH Git URL
      repo: 'git@github.com:Aman-kumarx1/WhatsApp-tool.git', 
      
      // 🎯 CRITICAL FIX: Absolute Windows path
      path: 'C:/Users/amank/pm2-deployments/whatsapp-tool-prod', 
      
      // --- HOOKS ---
      'pre-deploy-local': 'echo "Starting deployment..."', 
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'npm install -g pm2' 
    }
  }
};