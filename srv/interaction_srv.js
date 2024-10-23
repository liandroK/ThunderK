const cds = require('@sap/cds');

module.exports = async (srv) => {
    const db = await cds.connect.to('db');
    const Approvers = db.entities['app.salesK.Approvers'];
    const Sales = db.entities['app.salesK.Sales'];
    const SalesItems = db.entities['app.salesK.SalesItems'];
    const Materials = db.entities['app.salesK.Materials'];

    
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
        if (items && items.length > 0) {
            for (const item of items) {
                const material = await SELECT.one.from(Materials).where({ name: item.material });
            
                if (!material) {
                    return (`Material ${item.material} não encontrado`);
                }
                // Verifica se a quantidade pedida é maior que a quantidade disponível em stock
                if (item.qtd > material.stock) {
                    return (`Quantidade pedida (${item.qtd}) ultrapasa o stock disponível (${material.stock}) para o material `);
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

                //Atualiza o stock do material após a venda
                const novo_stock = material.stock - item.qtd;
                await UPDATE(Materials)
                    .set({ stock: novo_stock })
                    .where({ ID: material.ID });

                await INSERT(newSalesItem).into(SalesItems);

            }

        }

        const result = await INSERT(newSale).into(Sales);
        return `Sales order ${result.ID} created successfully!`;
    });

    srv.on('updateStatus', async req => {
        return await UPDATE(Sales)
            .set({ status: req.data.status })
            .where({ ID: req.data.id });
    })


    // Regex para validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Função para validar emails
    function validateEmail(email) {
        return emailRegex.test(email);
    }

    srv.on('validateApprovers', async (req) => {
        const { vendor, approver } = req.data;

        if (!validateEmail(vendor)) {
            return req.error(400, `O email do vendedor '${vendor}' não é válido.`);
        }

        if (!validateEmail(approver)) {
            return req.error(400, `O email do aprovador '${approver}' não é válido.`);
        }

        return true; // Retorna true se ambos os emails forem válidos
    });

    srv.on('READ', 'aprovadores', async (req) => {
        const { approver, vendor } = req.query;

        // Verifica se o pedido é para procurar por "vendor" ou "approver"
        if (vendor) {
            const vendorFound = await SELECT.one.from(Approvers).where({ vendor });
            if (!vendorFound) {
                return ({
                    code: 400,
                    message: `O vendor com email ${vendor} não foi encontrado.`,
                    status: 418 // Status personalizado
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
                    status: 418  // Status personalizado
                });
            }
            return approverFound;
        }

        // // Caso nenhum dos parâmetros seja encontrado
        // return ({
        //     code: 200,
        //     message: 'Parâmetro "vendor" ou "approver" em falta.',
        //     status: 200  // Status para parâmetro inválido
        // });
        return await SELECT.from(Approvers);
    });
    
    srv.on('artigos', async (req) => {
        const { $filter } = req.query;
    
        // Se houver um filtro e o filtro estiver a comparar o campo 'name'
        if ($filter) {
            const filterParts = $filter.split("eq");
            if (filterParts.length === 2) {
                const fieldName = filterParts[0].trim();
                const fieldValue = filterParts[1].trim().replace(/'/g, ''); // Remove as aspas do valor
    
                if (fieldName === "name") {
                    // Faz a consulta case insensitive
                    const materialsFound = await SELECT.from(Materials).where(`LOWER(name) = '${fieldValue.toLowerCase()}'`);
    
                    if (!materialsFound || materialsFound.length === 0) {
                        return {
                            code: 400,
                            message: `O material com nome '${fieldValue}' não foi encontrado.`,
                            status: 418 // Status personalizado
                        };
                    }
    
                    return materialsFound;
                }
            }
        }
    
        return await SELECT.from(Materials);
    });    

};



//                const material = await SELECT.one.from(Materials).where(`LOWER(name) = '${item.material.toLowerCase()}'` );
