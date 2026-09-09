export const environment = {
  production: true,
  // API adresi DERLEME ANINDA gömülür — değiştirdikten sonra yeniden build/deploy gerekir.
  //   Kendi alan adı : https://api.cloudposgrid.com/api
  //   Render (geçici): https://<render-servis-adi>.onrender.com/api
  // Sonundaki /api şart (backend rotaları /api ile başlıyor), sonda eğik çizgi OLMAMALI.
  apiUrl: 'https://api.cloudposgrid.com/api',
  appName: 'CloudPosGrid',
};
