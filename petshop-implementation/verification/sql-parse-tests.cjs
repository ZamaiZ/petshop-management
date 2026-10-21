const fs=require('fs'),path=require('path');
const {parse}=require('pgsql-parser');
(async()=>{let dir=path.resolve(__dirname,'../supabase/migrations');for(const file of fs.readdirSync(dir).sort()){try{await parse(fs.readFileSync(path.join(dir,file),'utf8'));console.log('OK SQL PARSE '+file)}catch(e){console.error('FAILED '+file,e.message);process.exitCode=1}}})();
