const fs=require('fs'), path=require('path');
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const [,,inFile,outFile]=process.argv;
const source=fs.readFileSync(inFile,'utf8');
const r=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
fs.mkdirSync(path.dirname(outFile),{recursive:true}); fs.writeFileSync(outFile,r.outputText,'utf8');
process.exit(0);
