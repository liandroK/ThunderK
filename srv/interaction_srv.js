// interactions_srv.js
const cds = require('@sap/cds');
const {
    validateEmail,
    createUserInSAP,
    getUsers
} = require('./userGroups'); 

module.exports = async (srv) => {
    const db = await cds.connect.to('db');
    const Approvers = db.entities['app.salesK.Approvers'];
    const Sales = db.entities['app.salesK.Sales'];
    const SalesItems = db.entities['app.salesK.SalesItems'];
    const Materials = db.entities['app.salesK.Materials'];

    // Handler para criar aprovadores
    srv.on('CREATE', 'aprovadores', async (req) => {
        const { vendor, approver } = req.data;

        // Validação dos emails
        if (!validateEmail(vendor) || !validateEmail(approver)) {
            return req.error(400, 'Os emails de vendor e approver precisam ser válidos.');
        }
        if (vendor === approver) {
            return req.error(400, 'Os emails de vendor e approver não podem ser iguais.');
        }

        try {
            // Obter lista de utilizadores atuais da API usando getUsers
            const users = await getUsers();

            // Verificar se o vendor e approver existem na API SAP
            const vendorExistsInSAP = users.some(user => user.email === vendor);
            const approverExistsInSAP = users.some(user => user.email === approver);

            // Verificar se já existe uma entrada para o par vendor-approver na tabela Approvers
            const approverRecord = await SELECT.one.from(Approvers).where({ vendor, approver });
            if (approverRecord) {
                return req.error(400, 'O par vendor e approver já existe na tabela Approvers.');
            }

            // Se o vendor não existir na API SAP, cria-o
            if (!vendorExistsInSAP) {
                await createUserInSAP(vendor, 'vendor', await cds.connect.to('auth_api'));
            }

            // Se o approver não existir na API SAP, cria-o
            if (!approverExistsInSAP) {
                await createUserInSAP(approver, 'approver', await cds.connect.to('auth_api'));
            }

            // Inserir o novo par na tabela Approvers
            await INSERT.into(Approvers).entries({ vendor, approver });
            return req.reply({ message: `Vendor '${vendor}' e approver '${approver}' foram adicionados com sucesso.` });

        } catch (error) {
            console.error('Erro ao conectar à API de autenticação ou criar utilizador:', error);
            return req.error(500, 'Erro ao conectar à API de autenticação ou criar utilizador.');
        }
    });

    // Handler para atualização de status de sales order
    srv.on('updateStatus', async (req) => {
        return await UPDATE(Sales).set({ status: req.data.status }).where({ salesID: req.data.id });
    });

    // Handler para a criação de sales order
    srv.on('create_salesorder', async (req) => {
        const { email_vendor, email_comprador, items } = req.data.sales;
        const approver = await SELECT.from(Approvers).where({ vendor: email_vendor });
        if (!approver || approver.length === 0) {
            return req.reject(406, `Vendedor com email ${email_vendor} não encontrado.`);
        }

        let newSale = {};
        let valor_total = 0;
        let itemCounter = 0;
        let valor_iva_total = 0;

        if (items && items.length > 0) {
            for (const item of items) {
                const material = await SELECT.one.from(Materials).where({ ID: item.material });
                if (!material) {
                    return req.reject(406, `Material ${item.material} não encontrado`);
                }
                if (item.qtd > material.stock) {
                    return req.reject(406, `Quantidade pedida (${item.qtd}) ultrapassa o stock disponível (${material.stock}) para o material ${item.material}.`);
                }

                const item_total = material.price * item.qtd;
                const item_iva = item_total * 0.23;
                valor_total += item_total + item_iva;
                valor_iva_total += item_iva;

                const maxSalesID = await SELECT.one('MAX(salesID) as maxID').from(Sales);
                const newSalesID = parseInt(maxSalesID.maxID || 0) + 1;

                newSale = {
                    salesID: newSalesID,
                    comprador: email_comprador,
                    vendor: email_vendor,
                    valor_total: valor_total,
                    status: "Pendente",
                    valor_iva: valor_iva_total
                };

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

                const novo_stock = material.stock - item.qtd;
                await UPDATE(Materials).set({ stock: novo_stock }).where({ ID: material.ID });
                await INSERT(newSalesItem).into(SalesItems);
            }
        }

        await INSERT(newSale).into(Sales);
        return req.reply({
            status: 202,
            message: `Sales order ${newSale.salesID} criada com sucesso!`,
            salesID: newSale.salesID
        });
    });

    // Implementação da função getSalesForPerson
    srv.on('getSalesForPerson', async (req) => {
        // Extrair o email do parâmetro
        const email = req.data.email || req.params[0];

        if (!email) {
            return req.reject(400, "O parâmetro 'email' é necessário.");
        }

        // Verificar se o email pertence a um vendor
        const vendorSales = await SELECT.from(Sales).where({ vendor: email });

        // Verificar se o email pertence a um approver e obter os vendors aprovados
        const approvedVendors = await SELECT.from(Approvers)
            .columns('vendor')
            .where({ approver: email });

        let approverSales = [];
        if (approvedVendors.length > 0) {
            // Se é approver, devolve as sales dos vendors que ele aprova
            approverSales = await SELECT.from(Sales)
                .where({ vendor: { in: approvedVendors.map(v => v.vendor) } });
        }

        // Combina as vendas do vendor e do approver, removendo duplicados, se existirem
        const combinedSales = [...vendorSales, ...approverSales];
        const uniqueSales = combinedSales.filter((sale, index, self) =>
            index === self.findIndex((s) => s.salesID === sale.salesID)
        );

        return uniqueSales;
    });
};
