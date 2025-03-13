require("lazyvim.util").lsp.on_attach(function(client)
	if client.name == "ts_ls" then
		client.server_capabilities.documentFormattingProvider = false
	end
	-- if client.name == "jsonls" then
	-- 	client.server_capabilities.documentFormattingProvider = false
	-- end
end)
