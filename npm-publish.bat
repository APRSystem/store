cd @ngxs
cd store
call npm unpublish --force
call npm publish
cd ..
cd devtools-plugin
call npm unpublish --force
call npm publish
cd ..
cd form-plugin
call npm unpublish --force
call npm publish
cd ..
cd hmr-plugin
call npm unpublish --force
call npm publish
cd ..
cd logger-plugin
call npm unpublish --force
call npm publish
cd ..
cd router-plugin
call npm unpublish --force
call npm publish
cd ..
cd storage-plugin
call npm unpublish --force
call npm publish
cd ..
cd websocket-plugin
call npm unpublish --force
call npm publish
cd ..
cd ..
pause