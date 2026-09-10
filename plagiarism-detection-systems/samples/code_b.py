def sum_prices(products):
    result = 0
    for product in products:
        result += product.price * product.quantity
    return result

def apply_discount(total, percent):
    return total - (total * percent / 100)
