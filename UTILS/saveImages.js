const fs = require('fs').promises;
const path = require('path');
const saveMediaToFile = async (media,filename) => {
    try{
        const filePath = path.join('./services/assets', filename+'.jpeg');
        console.log(filePath)
        await fs.writeFile(filePath, media.data, 'base64');
        console.log(`Media saved successfully: ${filePath}`);
        return filePath;
    }
    catch(err){
        console.log(`saving media failed`,err)
    }
    
  };
  module.exports=saveMediaToFile