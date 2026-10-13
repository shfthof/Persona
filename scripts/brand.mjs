import sharp from 'sharp';
for(const [file,size] of [['icon.png',1024],['favicon.png',64]]) await sharp('assets/brand/logo.svg').resize(size,size).png().toFile(`assets/brand/${file}`);
