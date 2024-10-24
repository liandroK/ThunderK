const cds = require('@sap/cds');

module.exports = async (srv) => {
    // Conexão à base de dados
    const db = await cds.connect.to('db');
    const Approvers = db.entities['app.salesK.Approvers'];
    const Sales = db.entities['app.salesK.Sales'];
    const SalesItems = db.entities['app.salesK.SalesItems'];
    const Materials = db.entities['app.salesK.Materials'];

    // Função para validar emails usando regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function validateEmail(email) {
        return emailRegex.test(email);
    }

    // Handler para a criação de sales order
    srv.on('create_salesorder', async (req) => {
        const { email_vendor, email_comprador, items } = req.data.sales;

        // Obter o aprovador
        const approver = await SELECT.from(Approvers).where({ vendor: email_vendor });
        if (!approver || approver.length === 0) {
            return `Aprovador com email ${email_vendor} não encontrado.`;
        }

        let newSale = {};
        let valor_total = 0;
        let itemCounter = 0;
        let valor_iva_total = 0;

        // Verifica se existem itens para processar
        if (items && items.length > 0) {
            for (const item of items) {
                const material = await SELECT.one.from(Materials).where({ ID: item.material });
                if (!material) {
                    return (`Material ${item.material} não encontrado`);
                }

                // Verifica stock disponível
                if (item.qtd > material.stock) {
                    return (`Quantidade pedida (${item.qtd}) ultrapassa o stock disponível (${material.stock}) para o material ${item.material}.`);
                }

                // Calcula valores do item
                const item_total = material.price * item.qtd;
                const item_iva = item_total * 0.23;
                valor_total += item_total + item_iva;
                valor_iva_total += item_iva;

                // Gera novo salesID
                const maxSalesID = await SELECT.one('MAX(salesID) as maxID').from(Sales);
                const newSalesID = parseInt(maxSalesID.maxID || 0) + 1;

                // Cria nova sale
                newSale = {
                    salesID: newSalesID,
                    comprador: email_comprador,
                    vendor: email_vendor,
                    valor_total: valor_total,
                    status: "Pendente",
                    valor_iva: valor_iva_total
                };

                // Cria novo sales item
                const newSalesItem = {
                    salesID: newSale.salesID,
                    item: itemCounter++,
                    sale: newSale,
                    material_ID: material.ID,
                    description: material.description,
                    price_unit: material.price,
                    iva_unit: material.price * 0.23,
                    price_total: (material.price * item.qtd) * 1.23,
                    qtd: item.qtd,
                };

                // Atualiza stock do material
                const novo_stock = material.stock - item.qtd;
                await UPDATE(Materials).set({ stock: novo_stock }).where({ ID: material.ID });

                // Insere o item na tabela de SalesItems
                await INSERT(newSalesItem).into(SalesItems);
            }
        }

        // Insere a nova sale
        const result = await INSERT(newSale).into(Sales);
        return `Sales order ${newSale.salesID} criada com sucesso!`;
    });

    // Handler para atualizar o status de uma venda
    srv.on('updateStatus', async (req) => {
        return await UPDATE(Sales).set({ status: req.data.status }).where({ ID: req.data.id });
    });

    async function triggerDestination() {
        try {
            const SPA_API = await cds.connect.to('auth_api');
            const result = await SPA_API.send(
                'GET',
                '/Users',
                { "Content-Type": "application/json" }
            );
    
            if (!result || !result.resources) {
                throw new Error('A resposta da API está mal formatada ou não contém recursos.');
            }
    
            return result.resources;  
        } catch (e) {
            throw new Error('Falha ao conectar à API de autenticação.');
        }
    }
    
    srv.on('CREATE', 'aprovadores', async (req) => {
        const { vendor, approver } = req.data;
    
       
        if (!validateEmail(vendor)) {
            return req.error(400, `O email do vendedor '${vendor}' não é válido.`);
        }
    
        if (!validateEmail(approver)) {
            return req.error(400, `O email do aprovador '${approver}' não é válido.`);
        }
    
        // Verifica se o email do vendor e do approver são iguais
        if (vendor === approver) {
            return req.error(400, 'O email do vendedor e do aprovador não podem ser iguais.');
        }
    
        // Chama a função que liga à API SAP
        try {
            const users = await triggerDestination(); 
    
            // Verifica se existe algum utilizador com userName igual ao approver
            const userExists = users.some(user => user.userName === approver);
    
            if (userExists) {
                // Se o utilizador existir, prossegue com a criação do registo
                return req.data;
            } else {
                // Caso contrário, retorna um erro
                return req.error(400, `O aprovador '${approver}' não existe na API SAP.`);
            }
    
        } catch (e) {
            // Caso ocorra um erro ao conectar à API
            return req.error(500, 'Erro ao conectar à API de autenticação.');
        }
    });
    

    // Handler para leitura de aprovadores
    srv.on('READ', 'aprovadores', async (req) => {
        const { approver, vendor } = req.query;

        // Verifica se é para procurar por vendor ou approver
        if (vendor) {
            const vendorFound = await SELECT.one.from(Approvers).where({ vendor });
            if (!vendorFound) {
                return ({
                    code: 400,
                    message: `O vendor com email ${vendor} não foi encontrado.`,
                    status: 418
                });
            }
            return vendorFound;
        }

        if (approver) {
            const approverFound = await SELECT.one.from(Approvers).where({ approver });
            if (!approverFound) {
                return ({
                    code: 400,
                    message: `O aprovador com email ${approver} não foi encontrado.`,
                    status: 418
                });
            }
            return approverFound;
        }

        // Retorna todos os aprovadores
        return await SELECT.from(Approvers);
    });
};
