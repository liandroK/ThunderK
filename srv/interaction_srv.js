const cds = require('@sap/cds');

module.exports = async (srv) => {
    const db = await cds.connect.to('db');
    const { Approvers, Sales, SalesItems, Material } = db.entities;

    srv.on('create_salesorder', async (req) => {
        const { email_vendedor, email_comprador, items } = req.data;

        const vendorRow = await SELECT.one.from(Approvers).where({ vendor: email_vendedor });
        

        if (items && items.length > 0) {
            for (const item of items) {

                const material = await SELECT.one.from(Material).where({ name: item.material });

                if (!material) {
                    return (`Material ${item.material} não encontrado`);
                }

                // Verifica se a quantidade pedida é maior que a quantidade disponível em stock
                if (item.qtd > material.stock) {
                    return (`Quantidade pedida (${item.qtd}) ultrapasa o stock disponível (${material.stock}) para o material ${material.name}`);
                }

                const item_total = item.price_unit * item.qtd;
                valor_total += item_total;
            }

        }
        const newSale = {
            comprador: email_comprador,
            vendor: vendorRow,
            valor_total: valor_total,
            status: "Pendente",
            valor_iva: valor_total + (valor_total * 0.23),
        };
        const [result] = await INSERT(Sales).into(newSale);


        let valor_total = 0;
        let itemCounter = 1;
        for (const item of items) {
            const material = await SELECT.one.from(Material).where({ name: item.material });

            const newSalesItem = {
                sale_ID: result.ID,
                item: itemCounter++,
                material_ID: material.ID,
                description: material.description,
                price_unit: item.price_unit,
                price_total: item.price_unit * item.qtd,
                qtd: item.qtd,
            };

            // Atualiza o stock do material após a venda
            const novo_stock = material.stock - item.qtd;
            await UPDATE(Material)
            .set({ stock: novo_stock })
            .where({ ID: material.ID });

            await INSERT(SalesItems).into(newSalesItem);
        }

        return `Sales order ${result.ID} created successfully!`;
    });
};

