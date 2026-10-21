import {build} from 'esbuild';
await build({entryPoints:['src/components/ui/combobox.jsx'],bundle:true,minify:true,format:'iife',outfile:'dist/combobox.js',define:{'process.env.NODE_ENV':'"production"'}});
