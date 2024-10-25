const cds = require('@sap/cds');

module.exports = async (srv) => {
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

    srv.on('updateStatus', async (req) => {
        return await UPDATE(Sales).set({ status: req.data.status }).where({ ID: req.data.id });
    });

    // Handler para obter os utilizadores diretamente da API `auth_api`
    srv.on('getUsers', async (req) => {
        try {
            const auth = await cds.connect.to('auth_api');
            const res = await auth.send({
                method: 'GET',
                path: '/Users',
                headers: {
                    Accept: 'application/scim+json',
                    'Content-Type': 'application/scim+json'
                }
            });
    
            // Ajuste para a chave correta "Resources" na resposta
            const users = (res.Resources || []).map(user => ({
                userName: user.userName || '',
                givenName: user.name?.givenName || '',
                familyName: user.name?.familyName || '',
                email: user.emails?.[0]?.value || ''
            }));
    
            console.log("Usuários obtidos:", users); // Verifica no log que os dados estão corretos
            return users;
    
        } catch (error) {
            console.error('Erro ao obter utilizadores:', error);
            return req.error(500, 'Erro ao obter utilizadores');
        }
    });

    // Handler para criar um novo usuário na API e adicioná-lo a um grupo
    srv.on('createUserInSAP', async (req) => {
        const { email, groupId } = req.data;
    
        if (!validateEmail(email)) {
            return req.error(400, `O email '${email}' não é válido.`);
        }
    
        try {
            // Chama a função para criar o usuário e obter a resposta
            const res = await createUserInSAP(email, groupId);
    
            console.log("Resposta da criação do utilizador:", res); // Log da resposta completa
            // Retorna os detalhes do usuário criado
            return {
                id: res.id,
                userName: res.userName,
                givenName: res.name?.givenName || '',
                familyName: res.name?.familyName || '',
                email: res.emails?.[0]?.value || ''
            };
    
        } catch (error) {
            console.error('Erro ao criar o utilizador na API SAP:', error); // Log detalhado do erro
            return req.error(500, error.message || 'Erro ao criar o utilizador na API SAP.');
        }
    });
    
    // Função genérica para criar usuários na API SAP e adicioná-los a um grupo
    async function createUserInSAP(email, groupId) {
        const [givenName, familyName] = email.split('@')[0].split('.');
        const payload = {
            "schemas": [
                "urn:ietf:params:scim:schemas:core:2.0:User",
                "urn:ietf:params:scim:schemas:extension:sap:2.0:User"
            ],
            "userName": email,
            "name": {
                "givenName": givenName || '',
                "familyName": familyName || ''
            },
            "displayName": givenName,
            "userType": "public",
            "active": true,
            "emails": [
                {
                    "value": email,
                    "primary": true
                }
            ]
        };
    
        try {
            const auth = await cds.connect.to('auth_api');
    
            // Envia o pedido para criar o utilizador
            const res = await auth.send({
                method: 'POST',
                path: '/Users',
                headers: {
                    Accept: 'application/scim+json',
                    'Content-Type': 'application/scim+json'
                },
                data: JSON.stringify(payload)
            });
    
            console.log("Resposta do POST para criar utilizador:", res); // Log da resposta do POST
    
            // Adiciona o usuário ao grupo especificado
            const userId = res.id;
            const groupPayload = {
                schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                Operations: [
                    {
                        op: "add",
                        path: "members",
                        value: [{ value: userId }]
                    }
                ]
            };
    
            // Envia o pedido para adicionar o usuário ao grupo
            const groupRes = await auth.send({
                method: 'PATCH',
                path: `/Groups/${groupId}`,
                headers: {
                    Accept: 'application/scim+json',
                    'Content-Type': 'application/scim+json'
                },
                data: JSON.stringify(groupPayload)
            });
    
            console.log("Resposta do PATCH para adicionar ao grupo:", groupRes); // Log da resposta do PATCH
            return res;
    
        } catch (error) {
            console.error('Erro ao criar ou adicionar o utilizador ao grupo na API SAP:', error);
            throw new Error('Erro ao criar o utilizador na API SAP.');
        }
    }


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

        const result = await INSERT(newSale).into(Sales);
        return req.send({
            status: 202,
            message: `Sales order ${newSale.salesID} criada com sucesso!`,
            salesID: newSale.salesID
        });
    });

    // Handler para criar aprovadores
    srv.on('CREATE', 'aprovadores', async (req) => {
        const { vendor, approver } = req.data;

        if (!validateEmail(vendor) || !validateEmail(approver)) {
            return req.error(400, 'Emails de vendedor e aprovador precisam ser válidos.');
        }
        if (vendor === approver) {
            return req.error(400, 'O email do vendedor e do aprovador não podem ser iguais.');
        }

        try {
            const users = await fetchUsersFromAPI();
            const vendorExists = users.some(user => user.userName === vendor);
            if (!vendorExists) {
                await createUserInSAP(vendor, 'ID_DO_GRUPO_VENDOR');
            }

            const approverExists = users.some(user => user.userName === approver);
            if (!approverExists) {
                await createUserInSAP(approver, 'ID_DO_GRUPO_APPROVER');
            }

            await INSERT.into(Approvers).entries({ vendor, approver });
            return req.reply({ message: `Vendedor '${vendor}' e aprovador '${approver}' adicionados.` });

        } catch (e) {
            return req.error(500, 'Erro ao conectar à API de autenticação.');
        }
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

