export const environment = {
  production: true,
  // API adresi DERLEME ANINDA gömülür — değiştirdikten sonra yeniden build/deploy gerekir.
  // Sonundaki /api şart (backend rotaları /api ile başlıyor), sonda eğik çizgi OLMAMALI.
  //
  // ŞU AN: Render'daki ücretsiz geçici dağıtım (canlı ve doğrulandı).
  // Kendi alan adına geçince burayı 'https://api.cloudposgrid.com/api' yap ve YENİDEN DERLE —
  // adres derleme anında gömüldüğü için yalnız ortam değişkeni değiştirmek YETMEZ.
  apiUrl: 'https://cloudposgrid-api.onrender.com/api',
  appName: 'CloudPosGrid',
};
